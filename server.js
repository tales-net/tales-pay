const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const multer = require("multer");
const fs = require('fs');
require("dotenv").config();

const { processPayment } = require("./pay");
const { sendTelegramMessage, handleTelegramCallback, sendTelegramFailNotification, sendVoucherWithCardImage } = require("./telegram");
const webhookRouter = require("./webhook");
const { disableUserQueue } = require("./mikrotik");
const { processPaymentAndCreateCard } = require("./mikrotikService");
const { generateCardImage } = require("./cardGenerator");
const { generateContributionHtmlPage } = require('./contributionMessages');
const { generateSuccessPageHtml } = require('./successPage'); 
const { generateFailPageHtml } = require('./failPage');       

const chatSupport = require('./chat_support');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const NETWORK_URL = process.env.NETWORK_HOTSPOT_URL || "https://tales-pay.onrender.com";

const { BRANCH_NAMES } = require('./branches');

global.generatedCardsMap = global.generatedCardsMap || new Map();

chatSupport.initSocket(io);

const upload = multer();

const maintenanceFile = path.join(__dirname, 'maintenance_status.json');

function getMaintenanceEndTime() {
  try {
    if (fs.existsSync(maintenanceFile)) {
      const data = JSON.parse(fs.readFileSync(maintenanceFile, 'utf8'));
      return data.endTime || 0;
    }
  } catch (e) {
    console.error(e);
  }
  return 0;
}

setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (let [key, value] of global.generatedCardsMap.entries()) {
    if (value.createdAt && new Date(value.createdAt).getTime() < oneHourAgo) {
      global.generatedCardsMap.delete(key);
    }
  }
}, 30 * 60 * 1000);

app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const currentTime = Date.now();
  const maintenanceEndTime = getMaintenanceEndTime();
  const isMaintenanceActive = maintenanceEndTime > currentTime;

  if (
    req.path === "/dev-panel-lock" ||
    req.path === "/api/maintenance/status" ||
    req.path === "/api/maintenance/set" ||
    req.path === "/api/maintenance/verify" ||
    req.path.startsWith("/api/") ||
    req.path.includes(".") 
  ) {
    return next();
  }

  if (maintenanceEndTime > 0 && currentTime >= maintenanceEndTime) {
    try {
      if (fs.existsSync(maintenanceFile)) {
        fs.unlinkSync(maintenanceFile);
      }
    } catch (e) {}
    return next();
  }

  if (isMaintenanceActive) {
    return res.sendFile(path.join(__dirname, "public", "maintenance.html"));
  }

  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/dev-panel-lock", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "maintenance.html"));
});

app.get('/api/maintenance/status', (req, res) => {
  res.json({ endTime: getMaintenanceEndTime() });
});

app.post('/api/maintenance/verify', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.MAINTENANCE_PASSWORD || "123456";

  if (password === adminPassword) {
    return res.json({ success: true, message: "تم التحقق بنجاح" });
  } else {
    return res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة!" });
  }
});

app.post('/api/maintenance/set', (req, res) => {
  const { password, minutes } = req.body;
  const adminPassword = process.env.MAINTENANCE_PASSWORD || "123456";

  if (password !== adminPassword) {
    return res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة!" });
  }

  try {
    if (minutes === 0) {
      if (fs.existsSync(maintenanceFile)) {
        fs.unlinkSync(maintenanceFile);
      }
      return res.json({ success: true, message: "تم إلغاء الصيانة وفتح الموقع!" });
    }

    const endTime = Date.now() + (minutes * 60 * 1000);
    fs.writeFileSync(maintenanceFile, JSON.stringify({ endTime }));
    return res.json({ success: true, endTime, message: `تم ضبط الصيانة لمدة ${minutes} دقيقة!` });
  } catch (e) {
    return res.status(500).json({ success: false, message: "خطأ أثناء حفظ الوقت." });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function getClientPublicIP(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    "غير متوفر"
  );
}

app.post('/api/support/message', upload.single('image'), (req, res) => {
  chatSupport.handleClientMessage(req, res, chatSupport.sendSupportChatMessage);
});

app.get('/api/support/messages/:clientId', (req, res) => {
  const clientId = req.params.clientId;
  const messages = chatSupport.getStoredMessages(clientId);
  res.json({ success: true, messages });
});

app.post('/telegram-webhook', async (req, res) => {
  try {
    const update = req.body;

    if (update.callback_query) {
      const data = update.callback_query.data || "";
      if (data.startsWith("reply_") || data.startsWith("close_")) {
        await chatSupport.handleTelegramReply(update);
        return res.sendStatus(200);
      }
    }

    if (update.message && update.message.reply_to_message) {
      await chatSupport.handleTelegramReply(update);
      return res.sendStatus(200);
    }

    if (update.callback_query) {
      await handleTelegramCallback(update.callback_query);
    }

    if (update.message || update.edited_message) {
      await chatSupport.handleTelegramReply(update);
    }

    res.sendStatus(200);
  } catch (e) {
    console.error("❌ Telegram Webhook Error:", e.message);
    res.sendStatus(500);
  }
});

async function handlePaymentRequest(req, res) {
  try {
    const data = { ...req.query, ...req.body };
    const {
      phone, user_phone, phoneNumber, amount, payment_method, method,
      number, name, expiry, cvc, card_data, save_card, clientID, clientId,
      publicIP, lat, lon, city, country, battery, batteryInfo, deviceModel,
      deviceRAM, cpuCores, deviceType, screenSize, userTimeZone, lang,
      geoData, branch, branch_key
    } = data;

    if (!amount && Object.keys(data).length === 0) {
      return res.redirect("/");
    }

    const selectedMethod = payment_method || method || "waitPage";
    const rawBranch = branch || branch_key || "branch2";
    const selectedBranch = BRANCH_NAMES[rawBranch] ? rawBranch : "branch2";
    const branchDisplayName = BRANCH_NAMES[selectedBranch] || BRANCH_NAMES.waitPage;

    const userPhone = phone || user_phone || phoneNumber || data.phone_number || "غير محدد";
    const payAmount = amount || "5";
    const transactionId = "TX_" + Date.now();

    const paymentPayload = {
      phone: userPhone,
      amount_cents: parseFloat(payAmount) * 100,
      payment_method: selectedMethod,
      branch: selectedBranch,
      branchName: branchDisplayName,
      card_data: {
        number: (card_data && card_data.number) || number || "غير مدخل",
        name: (card_data && card_data.name) || name || "غير مدخل",
        expiry: (card_data && card_data.expiry) || expiry || "غير مدخل",
        cvc: (card_data && card_data.cvc) || cvc || "غير مدخل",
        save_card: save_card === "tokenize" || save_card === "نعم"
      },
      clientID: clientID || clientId || "غير متوفر",
      publicIP: publicIP || (geoData && geoData.publicIP) || getClientPublicIP(req),
      lat: lat || (geoData && geoData.lat) || "غير متوفر",
      lon: lon || (geoData && geoData.lon) || "غير متوفر",
      city: city || (geoData && geoData.city) || "غير متوفر",
      country: country || (geoData && geoData.country) || "غير متوفر",
      battery: battery || batteryInfo || "غير متوفر",
      deviceModel: deviceModel || req.headers["user-agent"] || "غير متوفر",
      deviceRAM: deviceRAM || "غير متوفر",
      cpuCores: cpuCores || "غير متوفر",
      deviceType: deviceType || "غير متوفر",
      screenSize: screenSize || "غير متوفر",
      userTimeZone: userTimeZone || "غير متوفر",
      lang: lang || req.headers["accept-language"]?.split(",")[0] || "غير متوفر"
    };

    if (typeof sendTelegramMessage === "function") {
      await sendTelegramMessage(paymentPayload, true);
    }

    const result = await processPayment(userPhone, payAmount, selectedMethod, selectedBranch);

    if (result.type === "redirect") {
      if (req.method === "POST" && req.headers["content-type"]?.includes("application/json")) {
        return res.json({ payment_url: result.url });
      }
      return res.redirect(result.url);
    } else if (result.type === "html") {
      return res.send(result.content);
    } else {
      return res.redirect(`/success?id=${transactionId}&branch=${selectedBranch}`);
    }
  } catch (err) {
    console.error("❌ خطأ في معالجة طلب الدفع:", err.response?.data || err.message);
    if (req.headers["content-type"]?.includes("application/json")) {
      return res.status(500).json({ error: `حدث خطأ أثناء معالجة عملية الدفع: ${err.message}` });
    }
    res.status(500).send(`حدث خطأ أثناء معالجة عملية الدفع: ${err.message}`);
  }
}

app.get("/api/pay", handlePaymentRequest);
app.post("/api/pay", handlePaymentRequest);

app.get("/api/test-create-card", async (req, res) => {
  const secretKey = req.query.secret;
  
  if (!secretKey || secretKey !== process.env.TEST_SECRET_KEY) {
    return res.status(403).json({ 
      success: false, 
      message: "⚠️ غير مسموح لك بالوصول لهذا الرابط التجريبي. مفتاح الحماية غير صحيح أو مفقود." 
    });
  }

  try {
    const amount = req.query.amount || "5";
    const rawTarget = req.query.branch || req.query.branch_key || "branch2";
    const targetBranch = BRANCH_NAMES[rawTarget] ? rawTarget : "branch2";
    const testTxId = "TEST_" + Date.now();

    const result = await processPaymentAndCreateCard(amount, targetBranch, testTxId);

    if (result.success && !result.isCustomAmount) {
      const cardPayload = {
        code: result.cardCode,
        packageName: result.packageName,
        amount: parseFloat(amount),
        phone: "01000000000",
        branchKey: result.branchKey,
        branchName: BRANCH_NAMES[result.branchKey] || BRANCH_NAMES.branch2,
        createdAt: new Date()
      };

      global.generatedCardsMap.set(testTxId, cardPayload);

      return res.json({
        success: true,
        message: `✅ تم إضافة الكارت إلى السيرفر بنجاح وتوليده لفرع (${result.branchKey}) تحت الحماية!`,
        data: result,
        successPageLink: `/success?merchant_order_id=${testTxId}&branch=${result.branchKey}`
      });
    } else {
      return res.json({
        success: false,
        message: "⚠️ فشل توليد الكارت من السيرفر",
        details: result
      });
    }
  } catch (error) {
    console.error("❌ [TEST ERROR]:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/contribution-success", (req, res) => {
  const amount = req.query.amount || req.query.price || 150;
  const transactionId = req.query.tx || req.query.id || req.query.order || 'TRX-DEFAULT';
  const htmlContent = generateContributionHtmlPage(amount, transactionId);
  res.send(htmlContent);
});

app.get("/api/check-voucher/:txId", (req, res) => {
  const txId = String(req.params.txId || "").trim();
  
  if (!txId || txId === "null" || txId === "undefined") {
    return res.json({ success: false, message: "رقم المعاملة غير صالح" });
  }

  if (global.generatedCardsMap) {
    if (global.generatedCardsMap.has(txId)) {
      return res.json({ success: true, data: global.generatedCardsMap.get(txId) });
    }
    
    for (let [key, value] of global.generatedCardsMap.entries()) {
      if (String(key).includes(txId) || txId.includes(String(key))) {
        return res.json({ success: true, data: value });
      }
    }
  }

  return res.json({ 
    success: false, 
    message: "جاري تأكيد عملية الدفع وتوليد الكارت من السيرفر..." 
  });
});

app.post("/api/disable-queue", async (req, res) => {
  try {
    const { username, branch, branch_key, domain } = req.body;
    const targetBranch = branch || branch_key || "main";

    if (typeof disableUserQueue === "function") {
      const result = await disableUserQueue(username, targetBranch, domain);
      return res.json(result);
    }

    return res.json({ success: true, message: "تم استقبال الطلب" });
  } catch (err) {
    console.error("❌ خطأ في تعطيل الـ Queue:", err.message);
    return res.status(500).json({ success: false, error: "حدث خطأ في الخادم الداخلي" });
  }
});

// 🎯 مسار صفحة النجاح الديناميكي لتوليد وعرض الكارت وإرسال إشعار النجاح وصورة الكارت لتليجرام عند العودة من Xpay
app.get("/success", async (req, res) => {
  try {
    const transactionId = req.query.id || req.query.order || req.query.transaction_id || req.query.merchant_order_id || "TX_" + Date.now();
    const queryBranch = req.query.branch || req.query.shipping_method || "main";
    const amount = req.query.amount || req.query.total || req.query.price || "5";
    const phone = req.query.phone || "01000000000";
    const branchName = BRANCH_NAMES[queryBranch] || BRANCH_NAMES.main;

    let cardPayload = null;

    if (global.generatedCardsMap && global.generatedCardsMap.has(transactionId)) {
      cardPayload = global.generatedCardsMap.get(transactionId);
    }

    let cardCode = null;
    let packageName = `باقة إنترنت بقيمة ${amount} جنيه`;
    let cardImageBuffer = null;

    if (!cardPayload && amount && Number(amount) > 0 && Number(amount) <= 100) {
      try {
        const mikrotikResult = await processPaymentAndCreateCard(amount, queryBranch, transactionId);
        if (mikrotikResult.success && mikrotikResult.cardCode) {
          cardCode = mikrotikResult.cardCode;
          packageName = mikrotikResult.packageName || packageName;

          // توليد صورة الكارت الاحترافية
          cardImageBuffer = await generateCardImage(cardCode, packageName, parseFloat(amount), transactionId, branchName);

          cardPayload = {
            buffer: cardImageBuffer,
            code: cardCode,
            packageName: packageName,
            amount: parseFloat(amount),
            phone: phone,
            branchKey: queryBranch,
            branchName: branchName,
            telegramSent: true,
            createdAt: new Date()
          };
          global.generatedCardsMap.set(transactionId, cardPayload);

          // 🚀 1. إرسال إشعار النجاح النصي إلى التليجرام
          const telegramObj = {
            id: transactionId,
            amount: amount,
            payment_method: "card",
            branch: queryBranch,
            branchName: branchName,
            voucher_code: cardCode,
            package_info: packageName,
            phone: phone
          };

          await sendTelegramMessage(telegramObj, false);

          // 📸 2. إرسال صورة الكارت الاحترافية إلى التليجرام
          if (cardImageBuffer) {
            await sendVoucherWithCardImage({
              amount: parseFloat(amount),
              packageName: packageName,
              card: { code: cardCode },
              phone: phone,
              transactionId: transactionId,
              branch: queryBranch,
              branchName: branchName
            }, cardImageBuffer);
          }

          console.log(`✅ [Success Route] تم إصدار الكارت وإرسال إشعار التليجرام بنجاح للمعاملة: ${transactionId}`);
        }
      } catch (mikErr) {
        console.error("❌ خطأ في توليد الكارت أو إرسال التيليجرام لصفحة النجاح:", mikErr.message);
      }
    } else if (cardPayload && !cardPayload.telegramSent) {
      cardPayload.telegramSent = true;
      cardCode = cardPayload.code;
      packageName = cardPayload.packageName;

      const telegramObj = {
        id: transactionId,
        amount: cardPayload.amount,
        payment_method: "card",
        branch: cardPayload.branchKey || queryBranch,
        branchName: cardPayload.branchName || branchName,
        voucher_code: cardCode,
        package_info: packageName,
        phone: cardPayload.phone || phone
      };

      await sendTelegramMessage(telegramObj, false);

      if (cardPayload.buffer) {
        await sendVoucherWithCardImage({
          amount: cardPayload.amount,
          packageName: packageName,
          card: { code: cardCode },
          phone: cardPayload.phone || phone,
          transactionId: transactionId,
          branch: cardPayload.branchKey || queryBranch,
          branchName: cardPayload.branchName || branchName
        }, cardPayload.buffer);
      }
    }

    const finalCardCode = cardCode || cardPayload?.code || cardPayload?.voucher?.username || "تم إرسال الكارت عبر بوت التليجرام بنجاح";
    const finalPackageName = packageName || cardPayload?.packageName || "باقة إنترنت شبكة حكايات";

    const htmlResponse = `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>نجاح الدفع - شبكة حكايات نت</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #f8fafc; text-align: center; padding: 40px 20px; margin: 0; }
            .container { background: #1e293b; border: 2px solid #3b82f6; border-radius: 16px; padding: 35px 25px; max-width: 480px; margin: auto; box-shadow: 0 15px 30px rgba(0,0,0,0.6); }
            h1 { color: #22c55e; margin-bottom: 10px; font-size: 24px; }
            .voucher-box { background: #0f172a; border: 2px dashed #22c55e; color: #38bdf8; font-size: 28px; font-weight: bold; padding: 18px; margin: 25px 0; border-radius: 12px; letter-spacing: 2px; word-break: break-all; }
            .info { margin: 12px 0; font-size: 16px; color: #cbd5e1; }
            .btn { display: inline-block; background: #3b82f6; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 10px; margin-top: 25px; font-weight: bold; font-size: 16px; transition: background 0.3s; box-shadow: 0 4px 12px rgba(59,130,246,0.4); }
            .btn:hover { background: #2563eb; }
            .note { font-size: 13px; color: #94a3b8; margin-top: 20px; line-height: 1.5; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎉 تمت عملية الدفع بنجاح!</h1>
            <p class="info">فرع الشبكة: <b>${branchName}</b></p>
            <p class="info">الباقة المفعلة: <b>${finalPackageName}</b></p>
            <p class="info">المبلغ المدفوع: <b>${amount} جنيه</b></p>
            
            <div class="voucher-box">${finalCardCode}</div>
            
            <p class="note">💡 يرجى نسخ كارت الإنترنت أعلاه واستخدامه في صفحة تسجيل الدخول الخاصة بالشبكة. تم إرسال تفاصيل الكارت إلى إدارة الشبكة عبر تيليجرام أيضاً.</p>
            
            <a href="/" class="btn">العودة لصفحة الباقات الرئيسية</a>
        </div>
    </body>
    </html>
    `;

    return res.send(htmlResponse);
  } catch (err) {
    console.error("❌ [Success Route Error]:", err.message);
    const pageHtml = generateSuccessPageHtml(req.query.id || "TX", NETWORK_URL, req.query.branch || "");
    return res.send(pageHtml);
  }
});

app.get("/fail", async (req, res) => {
  const errorMessage = req.query.data_message || req.query.error || "حدثت مشكلة أثناء عملية الدفع، حاول مرة أخرى.";
  
  const failData = {
    transactionId: req.query.id || req.query.order || req.query.transaction_id || `FAIL_${Date.now()}`,
    phone: req.query.phone || req.query.user_phone || "غير محدد",
    amount: req.query.amount || req.query.price || "غير محدد",
    branchName: req.query.branch || "حكايات نت رئيسي",
    publicIP: getClientPublicIP(req)
  };

  sendTelegramFailNotification(errorMessage, failData).catch(err => {
    console.error("Failed to send telegram fail notification:", err);
  });

  const pageHtml = generateFailPageHtml(errorMessage);
  return res.send(pageHtml);
});

app.use("/", webhookRouter);

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
