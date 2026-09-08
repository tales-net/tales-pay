const axios = require('axios');

/**
 * دالة لإرسال إشعار التليجرام برابط آمن للمعاملة (بدون كشف الكارت في الرسالة لحمايته من السرقة)،
 * مع أزرار تفاعلية تعمل بطريقة "البث المباشر" عند الضغط عليها.
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

  // تصميم رسالة تليجرام تشبه البث المباشر والحالة اللحظية
  let messageText = `📡 *تنبيه عملية دفع جديدة (قيد المتابعة)*\n\n`;
  messageText += `📱 *رقم الهاتف:* \`${phone}\`\n`;
  messageText += `💰 *المبلغ:* \`${amount} جنيه\`\n`;
  messageText += `🏷️ *طريقة الدفع:* \`${paymentMethod}\`\n`;
  messageText += `🌐 *الفرع:* ${branchName}\n`;
  messageText += `🆔 *رقم المعاملة:* \`${transactionId}\`\n`;

  let inlineKeyboard = [];

  // إذا كانت معاملة مساهمة (أكبر من 100 جنيه)
  if (amount > 100 || paymentPayload.isContribution) {
    messageText += `\n✨ *نوع العملية:* مساهمة مالية ودعم للشبكة.`;
    
    // زر تفاعلي يفتح صفحة المساهمة مباشرة بشكل حي
    inlineKeyboard.push([
      {
        text: "🌟 فتح صفحة المساهمة وتحديث حالتها",
        url: `${WEBAPP_URL}/contribution-success?amount=${amount}&tx=${transactionId}`
      }
    ]);
  } else {
    // الباقات العادية: زر آمن يوجه لصفحة الانتظار (waitPage) التي تجلب الكارت حصرياً بشكل مباشر
    inlineKeyboard.push([
      {
        text: `🎫 عرض الكارت المولد وجلب بياناته (فوري)`,
        url: `${WEBAPP_URL}/wait?id=${transactionId}`
      }
    ]);
  }

  // زر إضافي دائم لفتح صفحة الانتظار العامة أو متابعة المعاملة
  inlineKeyboard.push([
    {
      text: "⚡ متابعة حالة الطلب لحظياً (بث مباشر)",
      url: `${WEBAPP_URL}/wait?id=${transactionId}`
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

    console.log(`✅ تم إرسال إشعار التليجرام برابط المعاملة الآمن بنجاح: ${transactionId}`);
    return response.data;
  } catch (error) {
    console.error("❌ فشل في إرسال إشعار تليجرام:", error.response?.data || error.message);
  }
}

module.exports = {
  sendPaymentNotificationWithButtons
};
