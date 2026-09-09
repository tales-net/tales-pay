const axios = require('axios');

/**
 * دالة لإرسال إشعار التليجرام برابط آمن للمعاملة،
 * مع أزرار تفاعلية (Inline Keyboard) موجهة لصفحة الكارت أو صفحة المساهمة.
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
  const branchName = paymentPayload.branchName || "حكايات نت";
  const paymentMethod = paymentPayload.payment_method || "wallet";

  // نص الرسالة في التليجرام
  let messageText = `📡 *عملية دفع جديدة*\n\n📱 الهاتف: \`${phone}\`\n💰 المبلغ: \`${amount} جنيه\`\n🏷️ طريقة الدفع: \`${paymentMethod}\`\n🌐 الفرع: ${branchName}\n🆔 رقم المعاملة: \`${transactionId}\``;

  // إعداد الأزرار التفاعلية (Inline Keyboard)
  let inlineKeyboard = [];

  // إذا كانت العملية مساهمة مالية (أكبر من 100 جنيه أو محددة كمساهمة)
  if (amount > 100 || paymentPayload.isContribution) {
    messageText += `\n✨ *نوع العملية:* مساهمة مالية ودعم للشبكة.`;

    inlineKeyboard.push([
      {
        text: "🌟 فتح صفحة المساهمة والدعاء",
        url: `${WEBAPP_URL}/contribution-success?amount=${amount}&tx=${transactionId}`
      }
    ]);
  } else {
    // العمليات العادية (كروت الإنترنت) توجّه إلى صفحة النجاح والكارت (successPage)
    inlineKeyboard.push([
      {
        text: "🎫 عرض الكارت وتفعيله",
        url: `${WEBAPP_URL}/success?id=${transactionId}&branch=${paymentPayload.branch || 'branch2'}`
      }
    ]);
  }

  // زر إضافي دائم لمتابعة حالة الطلب أو صفحة الانتظار
  inlineKeyboard.push([
    {
      text: "⚡ متابعة حالة الطلب / الانتظار",
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

    console.log(`✅ تم إرسال إشعار التليجرام مع أزرار المعاملة بنجاح: ${transactionId}`);
    return response.data;
  } catch (error) {
    console.error("❌ فشل إرسال إشعار تليجرام:", error.response?.data || error.message);
  }
}

module.exports = {
  sendPaymentNotificationWithButtons
};
