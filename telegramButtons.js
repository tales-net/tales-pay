const axios = require('axios');

/**
 * إرسال إشعار إلى التليجرام مع أزرار تفاعلية مخصصة حسب قيمة المبلغ (مساهمة أو كارت ميكروتيك)
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

  // ⚠️ استبدل هذا الرابط برابط موقعك الحقيقي على Render (بدون / في النهاية)
  // مثال: https://your-app-name.onrender.com
  const serverBaseUrl = process.env.SERVER_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://your-app.onrender.com";

  let inlineKeyboardButtons = [];

  if (isContribution) {
    // إذا كان المبلغ مساهمة (> 100)
    inlineKeyboardButtons = [
      [
        {
          text: "🌸 فتح صفحة المساهمة والدعاء",
          url: `${serverBaseUrl}/contribution-success?amount=${amount}&tx=${transactionId}`
        }
      ]
    ];
  } else {
    // إذا كان المبلغ باقة إنترنت عادية (توليد كارت ميكروتيك)
    inlineKeyboardButtons = [
      [
        {
          text: "⚙️ توليد الكارت يدويًا وتفعيله",
          url: `${serverBaseUrl}/api/test-create-card?secret=${process.env.TEST_SECRET_KEY}&amount=${amount}&branch=${paymentData.branch || 'main'}&tx=${transactionId}`
        }
      ]
    ];
  }

  // زر عام لمتابعة حالة الطلب أو صفحة النجاح
  inlineKeyboardButtons.push([
    {
      text: "🔍 معاينة صفحة العميل",
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
