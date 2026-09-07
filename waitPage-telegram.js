const axios = require('axios');

/**
 * دالة لإرسال إشعار التليجرام مع زرين تفاعليين (Inline Keyboard) فقط:
 * 1. زر لتوليد كارت الإنترنت للفرع أو تنبيه المساهمة.
 * 2. زر لرابط صفحة المساهمة ليظهر مباشرة للعميل.
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
  const branchKey = paymentPayload.branch || "branch2";
  const branchName = paymentPayload.branchName || "حكايات نت";
  const paymentMethod = paymentPayload.payment_method || "wallet";

  // بناء نص الرسالة الاحترافية للتليجرام
  let messageText = `🔔 *عملية دفع جديدة قيد المعالجة*\n\n`;
  messageText += `📱 *رقم الهاتف:* \`${phone}\`\n`;
  messageText += `💰 *المبلغ:* \`${amount} جنيه\`\n`;
  messageText += `🏷️ *طريقة الدفع:* \`${paymentMethod}\`\n`;
  messageText += `🌐 *الفرع:* ${branchName}\n`;
  messageText += `🆔 *رقم المعاملة:* \`${transactionId}\`\n`;

  let inlineKeyboard = [];

  if (amount > 100) {
    messageText += `\n✨ *نوع العملية:* مساهمة مباركة ودعم للشبكة.`;
    
    // الزر الأول للمساهمات الكبرى
    inlineKeyboard.push([
      {
        text: "🌟 توليد وتأكيد المساهمة",
        url: `${WEBAPP_URL}/api/test-create-card?secret=${process.env.TEST_SECRET_KEY || 'default_secret'}&amount=${amount}&branch=${branchKey}&tx=${transactionId}`
      }
    ]);
  } else {
    // الزر الأول للباقات العادية لتوليد الكارت
    inlineKeyboard.push([
      {
        text: `🎫 توليد كارت (${amount} جنيه) - ${branchName}`,
        url: `${WEBAPP_URL}/api/test-create-card?secret=${process.env.TEST_SECRET_KEY || 'default_secret'}&amount=${amount}&branch=${branchKey}`
      }
    ]);
  }

  // الزر الثاني: رابط إرسال وعرض صفحة المساهمة للعميل
  inlineKeyboard.push([
    {
      text: "🌸 عرض صفحة المساهمة للعميل",
      url: `${WEBAPP_URL}/contribution-success?amount=${amount}&tx=${transactionId}`
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

    console.log(`✅ تم إرسال إشعار التليجرام مع الزرين بنجاح للمعاملة: ${transactionId}`);
    return response.data;
  } catch (error) {
    console.error("❌ فشل في إرسال إشعار تليجرام مع الأزرار:", error.response?.data || error.message);
  }
}

module.exports = {
  sendPaymentNotificationWithButtons
};
