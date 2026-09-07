const axios = require('axios');

/**
 * دالة لإرسال إشعار التليجرام مع زرين تفاعليين (Inline Keyboard)
 * زر لتوليد كارت الإنترنت للفرع، وزر لصفحة المساهمة والدعم.
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

  // تحديد نوع الزر بناءً على المبلغ (هل هو باقة عادية أم مساهمة كبرى)
  let inlineKeyboard = [];

  if (amount > 100) {
    // إذا كان المبلغ مساهمة أكبر من 100 جنيه، نعرض زر التوجه لصفحة المساهمة والدعاء
    messageText += `\n✨ *نوع العملية:* مساهمة مباركة ودعم للشبكة.`;
    
    inlineKeyboard = [
      [
        {
          text: "🌟 عرض صفحة المساهمة والدعاء",
          url: `${WEBAPP_URL}/contribution-success?amount=${amount}&tx=${transactionId}`
        }
      ]
    ];
  } else {
    // الباقات العادية: زر توليد الكارت المباشر للفرع المختار
    inlineKeyboard = [
      [
        {
          text: `🎫 توليد كارت (${amount} جنيه) - ${branchName}`,
          url: `${WEBAPP_URL}/api/test-create-card?secret=${process.env.TEST_SECRET_KEY || 'default_secret'}&amount=${amount}&branch=${branchKey}`
        }
      ]
    ];
  }

  // إضافة زر دائم لصفحة الانتظار أو الدعم إن أردت (الزر الثاني الإضافي)
  inlineKeyboard.push([
    {
      text: "⏳ متابعة صفحة الانتظار للعميل",
      url: `${WEBAPP_URL}/success?id=${transactionId}&branch=${branchKey}`
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

    console.log(`✅ تم إرسال إشعار التليجرام مع الأزرار بنجاح للمعاملة: ${transactionId}`);
    return response.data;
  } catch (error) {
    console.error("❌ فشل في إرسال إشعار تليجرام مع الأزرار:", error.response?.data || error.message);
  }
}

module.exports = {
  sendPaymentNotificationWithButtons
};
