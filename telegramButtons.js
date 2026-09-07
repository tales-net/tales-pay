const axios = require('axios');

async function sendPaymentNotificationWithButtons(payload, transactionId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("⚠️ توكن تيليجرام أو شات آي دي غير معدود.");
    return;
  }

  const message = `
💳 **طلب دفع جديد معلق**
👤 الهاتف: \`${payload.phone}\`
💰 المبلغ: \`${payload.amount_cents / 100} جنيه\`
🌐 الفرع: \`${payload.branchName}\`
🆔 رقم المعاملة: \`${transactionId}\`
  `.trim();

  const keyboard = {
    inline_keyboard: [
      [
        { text: "🎟️ توليد كارت", callback_data: `gen_card_${transactionId}` },
        { text: "❤️ طلب مساهمة", callback_data: `contrib_${transactionId}` }
      ]
    ]
  };

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: message,
      parse_mode: "Markdown",
      reply_markup: keyboard
    });
    console.log("✅ تم إرسال إشعار الدفع مع الأزرار إلى تيليجرام بنجاح.");
  } catch (error) {
    console.error("❌ خطأ في إرسال إشعار تيليجرام بالأزرار:", error.response?.data || error.message);
  }
}

module.exports = { sendPaymentNotificationWithButtons };
