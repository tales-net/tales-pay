const axios = require('axios');

/**
 * إرسال رسالة إلى التليجرام مع زرين تفاعليين (المساهمة أو إنشاء الكارت) مرتبطة برقم العملية
 * @param {Object} paymentData - بيانات الدفع
 * @param {string} transactionId - رقم المعاملة الفريد
 */
async function sendPaymentNotificationWithButtons(paymentData, transactionId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("⚠️ توكن التليجرام أو معرف الشات (Chat ID) غير متوفر في ملف البيئة .env");
    return;
  }

  const messageText = `
🔔 *طلب دفع جديد / كارت إنترنت غير متوفر*
👤 *الهاتف:* ${paymentData.phone || "غير محدد"}
💰 *المبلغ:* ${paymentData.amount_cents ? paymentData.amount_cents / 100 : "5"} جنيه
🌐 *الفرع:* ${paymentData.branchName || "فرع غير محدد"}
🔢 *رقم المعاملة:* \`${transactionId}\`
  `.trim();

  // بناء الأزرار التفاعلية لتليجرام
  // ملاحظة: يمكنك وضع الروابط الحقيقية لسيرفرك هنا ليقوم الأدمن بالضغط عليها يدوياً
  const serverBaseUrl = process.env.SERVER_BASE_URL || "http://localhost:3000";

  const inlineKeyboard = {
    inline_keyboard: [
      [
        {
          text: "💳 صفحة المساهمة",
          url: `${serverBaseUrl}/contribution-success?amount=${(paymentData.amount_cents || 500) / 100}&tx=${transactionId}`
        },
        {
          text: "⚙️ توليد الكارت يدويًا",
          url: `${serverBaseUrl}/api/test-create-card?secret=${process.env.TEST_SECRET_KEY}&amount=${(paymentData.amount_cents || 500) / 100}&branch=${paymentData.branch || 'branch2'}`
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
    console.log("✅ تم إرسال إشعار التليجرام مع الأزرار بنجاح.");
  } catch (error) {
    console.error("❌ فشل إرسال إشعار التليجرام للأزرار:", error.response?.data || error.message);
  }
}

module.exports = { sendPaymentNotificationWithButtons };
