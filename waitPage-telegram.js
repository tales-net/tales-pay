const axios = require('axios');

/**
 * دالة لإرسال إشعار التليجرام برقم المعاملة وتفاصيل الطلب،
 * مع أزرار تفاعلية (Callback Data) لتحكم المشرف الفوري في تحويل صفحة العميل (كارت أو مساهمة).
 */
async function sendPaymentNotificationWithButtons(paymentPayload, transactionId) {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("⚠️ توكن بوت التليجرام أو معرف الشات (Chat ID) غير متوفر في ملف البيئة.");
    return;
  }

  // معالجة المبلغ بطريقة آمنة
  const amount = parseFloat(paymentPayload.amount_cents || 0) / 100;
  const phone = paymentPayload.phone || "غير محدد";
  const branchName = paymentPayload.branchName || "حكايات نت";
  const paymentMethod = paymentPayload.payment_method || "wallet";
  const branchKey = paymentPayload.branch || 'branch2';

  // بناء نص الرسالة بالتفاصيل لترسل إلى التليجرام
  let messageText = `📡 *طلب دفع بانتظار الموافقة*\n\n` +
                    `📱 الهاتف: \`${phone}\`\n` +
                    `💰 المبلغ: \`${amount} جنيه\`\n` +
                    `🏷️ طريقة الدفع: \`${paymentMethod}\`\n` +
                    `🌐 الفرع: ${branchName}\n` +
                    `🆔 رقم المعاملة: \`${transactionId}\``;

  // التحقق إضافياً إذا كانت مساهمة واضحة لإبرازها في النص للمشرف
  if (amount > 100 || paymentPayload.isContribution) {
    messageText += `\n\n✨ *نوع العملية:* مساهمة مالية محتملة أو دعم للشبكة.`;
  }

  // أزرار تفاعلية (Callback Data) يضغط عليها المشرف في التليجرام للتحكم بصفحة العميل فوراً
  let inlineKeyboard = [
    [
      {
        text: "✅ موافقة وإصدار الكارت",
        callback_data: `approve_card_${transactionId}_${branchKey}`
      },
      {
        text: "🌟 تحويل إلى مساهمة",
        callback_data: `approve_contrib_${transactionId}_${amount}`
      }
    ]
  ];

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

    console.log(`✅ تم إرسال إشعار أزرار التحكم بالموافقة للمعاملة: ${transactionId}`);
    return response.data;
  } catch (error) {
    console.error("❌ فشل إرسال إشعار تليجرام:", error.response?.data || error.message);
  }
}

module.exports = {
  sendPaymentNotificationWithButtons
};
