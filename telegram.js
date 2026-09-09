const axios = require("axios");
const FormData = require("form-data");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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
 * إرسال إشعار الدفع مع زرارين فقط (مساهمة / إصدار كارت)
 */
async function sendTelegramMessage(paymentPayload, transactionId) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn("⚠️ Telegram Bot Token or Chat ID is missing!");
      return;
    }

    const method = getPaymentMethodName(paymentPayload);
    const amountEGP = paymentPayload.amount_cents
      ? (paymentPayload.amount_cents / 100).toFixed(2)
      : (paymentPayload.amount || "غير محدد");
    const dateTimeStr = getFormattedDateTime();

    const branchName = paymentPayload.branchName || "حكايات نت رئيسي";
    const userPhone = paymentPayload.phone || "غير محدد";

    let message = `📡 <b>عملية دفع جديدة</b>\n\n` +
                  `🏢 الفرع: <b>${branchName}</b>\n` +
                  `💳 وسيلة الدفع: <b>${method}</b>\n` +
                  `💰 المبلغ المطلوب: <b>${amountEGP} جنيه</b>\n` +
                  `📱 الهاتف: <code>${userPhone}</code>\n` +
                  `🆔 رقم المعاملة: <code>${transactionId}</code>\n` +
                  `----------------------------------------\n` +
                  `📅 وقت الإرسال: <code>${dateTimeStr}</code>\n\n` +
                  `⏳ العميل الآن في صفحة الانتظار، اختر الإجراء المناسب:`;

    // زرارين فقط بدون روابط
    const inlineKeyboard = [
      [{ text: "🌟 تأكيد المساهمة", callback_data: `contribution_${transactionId}_${amountEGP}` }],
      [{ text: "🎫 إصدار الكارت", callback_data: `issuecard_${transactionId}_${amountEGP}` }]
    ];

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: inlineKeyboard }
    });

    console.log(`✅ [Telegram] تم إرسال إشعار الدفع مع زرارين للمعاملة: ${transactionId}`);
  } catch (err) {
    console.error("❌ [Telegram Error]:", err.response?.data || err.message);
  }
}

/**
 * إرسال صورة الكارت بعد الإصدار (اختياري)
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

    const caption = `🎟️ <b>صورة الكارت المصدر</b>\n\n` +
                    `🏢 الفرع: <b>${paymentDetails.branchName || 'حكايات نت رئيسي'}</b>\n` +
                    `📦 الباقة: <b>${paymentDetails.packageName || 'باقة إنترنت'}</b>\n` +
                    `💰 المبلغ: <b>${paymentDetails.amount} جنيه</b>\n` +
                    `🔑 الكارت: <code>${paymentDetails.code || 'غير متوفر'}</code>\n` +
                    `📱 الهاتف: <code>${paymentDetails.phone || 'غير محدد'}</code>\n` +
                    `🆔 رقم العملية: <code>${paymentDetails.transactionId || 'غير متوفر'}</code>`;

    form.append("caption", caption);
    form.append("parse_mode", "HTML");

    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, form, {
      headers: { ...form.getHeaders() }
    });

    if (response.data && response.data.ok) {
      console.log(`📸 [Telegram Image SUCCESS] تم إرسال صورة الكارت للمعاملة: ${paymentDetails.transactionId}`);
    }
  } catch (err) {
    console.error("❌ [Telegram Image Error]:", err.response?.data || err.message);
  }
}

module.exports = {
  sendTelegramMessage,
  sendVoucherWithCardImage
};
