// contributionTelegram.js
const axios = require("axios");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * إرسال إشعار تليجرام خاص بطلب المساهمة مع زر مباشر لصفحة المساهمة
 */
async function sendContributionNotification(data) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn("⚠️ [Contribution Telegram] Telegram Bot Token or Chat ID is missing!");
      return;
    }

    const transactionId = data.transactionId || data.id || "TX_" + Date.now();
    const amount = data.amount || "5";
    const userPhone = data.phone || "غير محدد";
    const branchName = data.branchName || "حكايات نت رئيسي";

    const message = `🤝 <b>طلب مساهمة جديد / دعم الشبكة</b>\n\n` +
                  `🏢 الفرع: <b>${branchName}</b>\n` +
                  `🆔 رقم المعاملة: <code>${transactionId}</code>\n` +
                  `📱 رقم الهاتف: <code>${userPhone}</code>\n` +
                  `💰 المبلغ المطلوب: <b>${amount} جنيه</b>\n` +
                  `----------------------------------------\n` +
                  `👇 اضغط الزر أدناه لفتح واختبار صفحة المساهمة للعميل:`;

    // زر تفاعلي يوجه لفتح الرابط أو تفعيل الصفحة مباشرة
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "🌐 فتح صفحة المساهمة (مباشر)", callback_data: `open_contrib_page_${transactionId}` }
        ]
      ]
    };

    const payload = {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
      reply_markup: replyMarkup
    };

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, payload);
    console.log(`✅ [Contribution Telegram] تم إرسال إشعار المساهمة للمعاملة: ${transactionId}`);

  } catch (err) {
    console.error("❌ [Contribution Telegram Error]:", err.response?.data || err.message);
  }
}

module.exports = {
  sendContributionNotification
};
