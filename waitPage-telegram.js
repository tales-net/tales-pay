const axios = require('axios');

/**
 * دالة لإرسال إشعار التليجرام مع زر آمن لتأكيد العملية وتحديث صفحة العميل تلقائياً
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

  // نص رسالة البث المباشر في التليجرام
  let messageText = `⚡ *طلب دفع جديد (بانتظار التأكيد)*\n\n`;
  messageText += `📱 *رقم الهاتف:* \`${phone}\`\n`;
  messageText += `💰 *المبلغ:* \`${amount} جنيه\`\n`;
  messageText += `🏷️ *الطريقة:* \`${paymentMethod}\`\n`;
  messageText += `🌐 *الفرع:* ${branchName}\n`;
  messageText += `🆔 *المعاملة:* \`${transactionId}\`\n`;

  let inlineKeyboard = [];

  if (amount > 100) {
    messageText += `\n✨ *نوع العملية:* مساهمة مالية كبرى.`;
    
    // زر تأكيد المساهمة وإرسالها لصفحة العميل بسرعة
    inlineKeyboard.push([
      {
        text: "✅ تأكيد وتفعيل المساهمة لصفحة العميل",
        url: `${WEBAPP_URL}/api/approve-payment?secret=${process.env.TEST_SECRET_KEY || 'default_secret'}&tx=${transactionId}&amount=${amount}&branch=${branchKey}`
      }
    ]);
  } else {
    // زر إصدار وتأكيد الكارت وإرساله مباشرة لصفحة الانتظار الخاصة بالعميل دون عرضه في التليجرام
    inlineKeyboard.push([
      {
        text: `🎟️ إصدار الكارت وإرساله لصفحة العميل (${amount} ج)`,
        url: `${WEBAPP_URL}/api/approve-payment?secret=${process.env.Test_SECRET_KEY || process.env.TEST_SECRET_KEY || 'default_secret'}&tx=${transactionId}&amount=${amount}&branch=${branchKey}`
      }
    ]);
  }

  // الزر الثاني: فتح صفحة المساهمة أو متابعة العميل مباشرة
  inlineKeyboard.push([
    {
      text: "🌐 متابعة صفحة العميل الحالية",
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

    console.log(`✅ تم إرسال إشعار التليجرام الآمن بنجاح للمعاملة: ${transactionId}`);
    return response.data;
  } catch (error) {
    console.error("❌ فشل في إرسال إشعار تليجرام:", error.response?.data || error.message);
  }
}

module.exports = {
  sendPaymentNotificationWithButtons
};
