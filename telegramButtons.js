const axios = require('axios');

/**
 * إرسال إشعار الدفع إلى التليجرام مع زرين تفاعليين (صفحة المساهمة وتوليد الكارت يدويًا)
 * @param {Object} paymentData - بيانات عملية الدفع
 * @param {string} transactionId - رقم المعاملة الفريد
 */
async function sendPaymentNotificationWithButtons(paymentData, transactionId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("⚠️ توكن التليجرام أو معرف الشات (Chat ID) غير متوفر في ملف البيئة .env");
    return;
  }

  const amountValue = paymentData.amount_cents ? paymentData.amount_cents / 100 : "5";
  
  const messageText = `
🔔 *طلب دفع جديد / كارت إنترنت غير متوفر*
👤 *الهاتف:* ${paymentData.phone || "غير محدد"}
💰 *المبلغ:* ${amountValue} جنيه
🌐 *الفرع:* ${paymentData.branchName || "فرع غير محدد"}
🔢 *رقم المعاملة:* \`${transactionId}\`
  `.trim();

  // جلب رابط السيرفر الأساسي من البيئة أو افتراضي
  const serverBaseUrl = process.env.SERVER_BASE_URL || "http://localhost:3000";

  // الأزرار الشفافة (Inline Keyboard) لتليجرام
  const inlineKeyboard = {
    inline_keyboard: [
      [
        {
          text: "💳 صفحة المساهمة",
          url: `${serverBaseUrl}/api/force-contribution?tx=${transactionId}&amount=${amountValue}`
        },
        {
          text: "⚙️ توليد الكارت يدويًا",
          url: `${serverBaseUrl}/api/test-create-card?secret=${process.env.TEST_SECRET_KEY}&amount=${amountValue}&branch=${paymentData.branch || 'branch2'}&tx=${transactionId}`
        }
      ]
    ]
  };

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: messageText,
      parse_mode: "Markdown",
      reply_markup: inlineKeyboard
    });
    console.log("✅ تم إرسال إشعار التليجرام مع الأزرار التفاعلية بنجاح.");
  } catch (error) {
    console.error("❌ فشل إرسال إشعار التليجرام للأزرار:", error.response?.data || error.message);
  }
}

module.exports = { sendPaymentNotificationWithButtons };
