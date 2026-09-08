const axios = require('axios');

/**
 * دالة لإرسال إشعار التليجرام برابط آمن للمعاملة،
 * مع أزرار تفاعلية (Inline Keyboard) تعمل عند الضغط عليها.
 */
async function sendPaymentNotificationWithButtons(paymentPayload, transactionId) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  const WEBAPP_URL = process.env.RENDER_EXTERNAL_URL || "https://tales-pay.onrender.com";

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("⚠️ توكن بوت التليجرام أو معرف الشات (Chat ID) غير متوفر في ملف البيئة.");
    return;
  }

  const amount = parseFloat(paymentPayload.amount_cents) / 100;
  const phone = paymentPayload.phone || "غير محدد";
  const branchName = paymentPayload.branchName || "حكايات نت";
  const paymentMethod = paymentPayload.payment_method || "wallet";

  // نص الرسالة
  let messageText = `📡 *عملية دفع جديدة*\n\n`;
  messageText += `📱 الهاتف: \`${phone}\`\n`;
  messageText += `💰 المبلغ: \`${amount} جنيه\`\n`;
  messageText += `🏷️ طريقة الدفع: \`${paymentMethod}\`\n`;
  messageText += `🌐 الفرع: ${branchName}\n`;
  messageText += `🆔 رقم المعاملة: \`${transactionId}\`\n`;

  let inlineKeyboard = [];

  // إذا كانت مساهمة
  if (amount > 100 || paymentPayload.isContribution) {
    messageText += `\n✨ *نوع العملية:* مساهمة مالية ودعم للشبكة.`;

    inlineKeyboard.push([
      {
        text: "🌟 فتح صفحة المساهمة",
        url: `${WEBAPP_URL}/contribution-success?amount=${amount}&tx=${transactionId}`
      }
    ]);
  } else {
    // الباقات العادية
    inlineKeyboard.push([
      {
        text: "🎫 عرض الكارت",
        url: `${WEBAPP_URL}/wait?id=${transactionId}`
      }
    ]);
  }

  // زر إضافي دائم لمتابعة الطلب
  inlineKeyboard.push([
    {
      text: "⚡ متابعة حالة الطلب",
      url: `${WEBAPP_URL}/wait?id=${transactionId}`
    }
  ]);

  const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const response = await axios.post(telegramApiUrl, {
      chat_id: TELEGRAM_CHAT_ID,
      text: messageText,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: inlineKeyboard
      }
    });

    console.log(`✅ تم إرسال إشعار التليجرام مع زرار المعاملة: ${transactionId}`);
    return response.data;
  } catch (error) {
    console.error("❌ فشل إرسال إشعار تليجرام:", error.response?.data || error.message);
  }
}

module.exports = {
  sendPaymentNotificationWithButtons
};
