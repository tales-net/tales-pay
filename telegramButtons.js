const axios = require('axios');

/**
 * إرسال إشعار تليجرام مع زرين تفاعليين يدويين مرتبطين برقم المعاملة
 * @param {Object} paymentData - بيانات الطلب أو الدفع
 * @param {string} transactionId - رقم المعاملة الفريد
 */
async function sendTelegramManualButtons(paymentData, transactionId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("⚠️ توكن تليجرام أو معرف الشات غير متاح للإشعارات اليدوية.");
    return;
  }

  const amount = paymentData.amount_cents ? paymentData.amount_cents / 100 : (paymentData.amount || 5);
  const branch = paymentData.branch || paymentData.branchKey || "main";
  const phone = paymentData.phone || "غير محدد";
  const serverBaseUrl = process.env.SERVER_BASE_URL || "https://tales-pay.onrender.com";

  const messageText = `
⚠️ *طلب دفع جديد / كارت إنترنت غير متوفر (يدوي)*
━━━━━━━━━━━━━━━━━━━━
📱 *الهاتف:* \`${phone}\`
💰 *المبلغ:* *${amount} جنيه*
🌐 *الفرع:* ${branch}
🔢 *رقم العملية:* \`${transactionId}\`
━━━━━━━━━━━━━━━━━━━━
*(اختر الإجراء المناسب يدويًا من الأزرار أدناه)*
  `.trim();

  // أزرار تليجرام التفاعلية (Inline Keyboard)
  const inlineKeyboard = {
    inline_keyboard: [
      [
        {
          text: "🌟 صفحة المساهمة",
          url: `${serverBaseUrl}/contribution-success?amount=${amount}&tx=${transactionId}`
        },
        {
          text: "💳 إصدار الكارت المرتبط",
          url: `${serverBaseUrl}/api/manual-create-card?tx=${transactionId}&amount=${amount}&branch=${branch}`
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
    console.log(`✅ تم إرسال رسالة الأزرار اليدوية لتليجرام برقم العملية: ${transactionId}`);
  } catch (error) {
    console.error("❌ خطأ في إرسال الأزرار اليدوية لتليجرام:", error.response?.data || error.message);
  }
}

module.exports = { sendTelegramManualButtons };
