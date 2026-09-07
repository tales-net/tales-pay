const axios = require('axios');

/**
 * إرسال إشعار إلى التليجرام مع أزرار تفاعلية برمجية (Callback Data) 
 * لتتحكم بلحظتها بصفحة العميل (سواء المساهمة أو توليد الكارت)
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

  const amount = paymentData.amount_cents ? paymentData.amount_cents / 100 : (paymentData.amount || 5);
  const isContribution = amount > 100;
  const branchKey = paymentData.branch || paymentData.branch_key || 'main';

  const messageText = `
🔔 *طلب دفع جديد (في انتظار العميل)*
👤 *الهاتف:* ${paymentData.phone || "غير محدد"}
💰 *المبلغ:* ${amount} جنيه
🌐 *الفرع:* ${paymentData.branchName || "فرع حكايات نت"}
🔢 *رقم المعاملة:* \`${transactionId}\`
📌 *النوع:* ${isContribution ? "🌸 مساهمة ودعم للشبكة (> 100)" : "🎟️ باقة إنترنت ميكروتيك"}
  `.trim();

  const serverBaseUrl = process.env.SERVER_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://tales-pay.onrender.com";

  let inlineKeyboardButtons = [];

  if (isContribution) {
    // 🌸 زر تفاعلي للمساهمة: عند ضغطه سيفتح صفحة المساهمة خفية أمام العميل فوراً
    inlineKeyboardButtons = [
      [
        {
          text: "🌸 إظهار صفحة المساهمة والدعاء للعميل",
          callback_data: `show_contrib_${transactionId}_${amount}`
        }
      ]
    ];
  } else {
    // 🎟️ زر تفاعلي لتوليد الكارت: عند ضغطه سيقوم السيرفر بتوليد الكارت وإظهاره للعميل فوراً
    inlineKeyboardButtons = [
      [
        {
          text: "⚙️ توليد كارت الميكروتيك وتفعيله",
          callback_data: `approve_card_${transactionId}_${branchKey}_${amount}`
        }
      ]
    ];
  }

  // زر إضافي اختياري لمعاينة الصفحة
  inlineKeyboardButtons.push([
    {
      text: "🔍 معاينة صفحة الانتظار",
      url: `${serverBaseUrl}/success?merchant_order_id=${transactionId}&branch=${branchKey}`
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
    console.log("✅ تم إرسال إشعار التليجرام مع الأزرار التفاعلية البرمجية بنجاح.");
  } catch (error) {
    console.error("❌ فشل إرسال إشعار التليجرام للأزرار:", error.response?.data || error.message);
  }
}

/**
 * معالجة الضغط على الأزرار الواردة من تليجرام (Callback Query Handler)
 * يجب استدعاء هذه الدالة في البوت الرئيسي عند استقبال أي click من الأزرار
 */
async function handleTelegramCallback(callbackQuery, io) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const data = callbackQuery.data;
  const callbackQueryId = callbackQuery.id;

  try {
    // 1. معالجة زر إظهار صفحة المساهمة
    if (data.startsWith('show_contrib_')) {
      const parts = data.replace('show_contrib_', '').split('_');
      const txId = parts[0];
      const amount = parts[1] || "150";

      const redirectUrl = `/contribution-page?tx=${encodeURIComponent(txId)}&amount=${encodeURIComponent(amount)}`;

      // تخزين الحالة ليعمل الـ Polling والـ Socket.io بشكل مضمون 100%
      if (!global.generatedCardsMap) {
        global.generatedCardsMap = new Map();
      }
      global.generatedCardsMap.set(txId, {
        action: 'contribution',
        redirectUrl: redirectUrl,
        createdAt: new Date()
      });

      // إرسال الإشارة عبر Socket.io للعميل المفتوح لديه صفحة الانتظار
      if (io) {
        io.to(txId).emit('redirect_contribution', { url: redirectUrl });
      }

      // الرد على تليجرام لإزالة علامة التحميل
      await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQueryId,
        text: "🌟 تم فتح صفحة المساهمة أمام العميل بنجاح!",
        show_alert: false
      });
      console.log(`🚀 تم توجيه المعاملة ${txId} إلى صفحة المساهمة بنجاح.`);
    }

    // 2. معالجة زر إصدار وتوليد كارت الميكروتيك
    else if (data.startsWith('approve_card_')) {
      const parts = data.replace('approve_card_', '').split('_');
      const txId = parts[0];
      const branch = parts[1] || 'main';
      const amount = parts[2] || '5';

      // يمكنك هنا استدعاء دالة توليد الكارت الحقيقية الخاصة بك أو عمل طلب داخلي للسيرفر
      // على سبيل المثال، نقوم بتحديث الذاكرة ليظهر الكارت للعميل في الـ Modal:
      const dummyCode = "HS-" + Math.floor(100000 + Math.random() * 900000); // استبدلها بكود الكارت الفعلي من الميكروتيك
      
      if (!global.generatedCardsMap) {
        global.generatedCardsMap = new Map();
      }
      global.generatedCardsMap.set(txId, {
        code: dummyCode,
        amount: amount,
        createdAt: new Date()
      });

      if (io) {
        io.to(txId).emit('voucher_ready', { success: true, code: dummyCode, amount: amount });
      }

      await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQueryId,
        text: `🎟️ تم توليد الكارت بنجاح: ${dummyCode}`,
        show_alert: true
      });
      console.log(`🎟️ تم توليد كارت الميكروتيك للمعاملة ${txId} بنجاح.`);
    }

  } catch (err) {
    console.error("❌ خطأ في معالجة أزرار التليجرام:", err.response?.data || err.message);
  }
}

module.exports = {
  sendPaymentNotificationWithButtons,
  handleTelegramCallback
};
