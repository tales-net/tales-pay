const axios = require('axios');

/**
 * إرسال إشعار إلى التليجرام مع أزرار تفاعلية مخصصة (مساهمة فورية أو كارت ميكروتيك)
 * @param {Object} paymentData - بيانات الدفع
 * @param {string} transactionId - رقم العملية الفريد
 */
async function sendPaymentNotificationWithButtons(paymentData, transactionId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("⚠️ توكن التليجرام أو معرف الشات (Chat ID) غير متوفر في ملف البيئة .env");
    return;
  }

  const amount = paymentData.amount_cents ? paymentData.amount_cents / 100 : (paymentData.amount || 5);
  const isContribution = amount > 100;

  const messageText = `
🔔 *طلب دفع جديد*
👤 *الهاتف:* ${paymentData.phone || "غير محدد"}
💰 *المبلغ:* ${amount} جنيه
🌐 *الفرع:* ${paymentData.branchName || paymentData.branch || "main"}
🔢 *رقم العملية:* \`${transactionId}\`
📌 *النوع:* ${isContribution ? "🌸 مساهمة ودعم للشبكة" : "🎟️ باقة إنترنت ميكروتيك"}
  `.trim();

  const serverBaseUrl = process.env.SERVER_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://your-app.onrender.com";

  let inlineKeyboardButtons = [];

  if (isContribution) {
    inlineKeyboardButtons = [
      [
        {
          text: "🌸 فتح صفحة المساهمة أمام العميل فوراً",
          url: `${serverBaseUrl}/api/force-contribution?tx=${transactionId}&amount=${amount}`
        }
      ]
    ];
  } else {
    inlineKeyboardButtons = [
      [
        {
          text: "⚙️ توليد الكارت وتفعيله للعميل",
          url: `${serverBaseUrl}/api/test-create-card?secret=${process.env.TEST_SECRET_KEY}&amount=${amount}&branch=${paymentData.branch || 'main'}&tx=${transactionId}`
        }
      ]
    ];
  }

  inlineKeyboardButtons.push([
    {
      text: "🔍 معاينة صفحة العميل الحالية",
      url: `${serverBaseUrl}/success?merchant_order_id=${transactionId}&branch=${paymentData.branch || 'main'}`
    }
  ]);

  const inlineKeyboard = {
    inline_keyboard: inlineKeyboardButtons
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
