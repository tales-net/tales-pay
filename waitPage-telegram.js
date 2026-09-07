const axios = require('axios');

/**
 * إرسال إشعار إلى التليجرام مع زر يوجه لصفحة الانتظار (WaitPage) الخاصة بالمعاملة
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

  const amount = paymentData.amount_cents ? paymentData.amount_cents / 100 : 5;
  const isContribution = amount > 100;

  const messageText = `
🔔 *طلب دفع جديد*
👤 *الهاتف:* ${paymentData.phone || "غير محدد"}
💰 *المبلغ:* ${amount} جنيه
🌐 *الفرع:* ${paymentData.branchName || "فرع غير محدد"}
🔢 *رقم المعاملة:* \`${transactionId}\`
📌 *النوع:* ${isContribution ? "🌸 مساهمة ودعم للشبكة" : "🎟️ باقة إنترنت ميكروتيك"}
  `.trim();

  const serverBaseUrl = process.env.SERVER_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://your-app.onrender.com";

  let inlineKeyboardButtons = [];

  // الزر الرئيسي الذي يوجه لصفحة الانتظار الافتراضية المرتبطة بالمعاملة
  if (isContribution) {
    inlineKeyboardButtons = [
      [
        {
          text: "🌸 فتح صفحة الانتظار / المساهمة",
          url: `${serverBaseUrl}/wait?tx=${transactionId}`
        }
      ]
    ];
  } else {
    inlineKeyboardButtons = [
      [
        {
          text: "⏳ فتح صفحة الانتظار وتوليد الكارت",
          url: `${serverBaseUrl}/wait?tx=${transactionId}`
        }
      ]
    ];
  }

  // زر إضافي احتياطي لمعاينة الكارت أو الصفحة مباشرة
  inlineKeyboardButtons.push([
    {
      text: "🔍 معاينة حالة العميل المباشرة",
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
    console.log("✅ تم إرسال إشعار التليجرام مع الأزرار التفاعلية المحدثة بنجاح.");
  } catch (error) {
    console.error("❌ فشل إرسال إشعار التليجرام للأزرار:", error.response?.data || error.message);
  }
}

module.exports = { sendPaymentNotificationWithButtons };
