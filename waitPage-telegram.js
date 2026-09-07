const axios = require('axios');

/**
 * إرسال إشعار إلى التليجرام مع أزرار تفاعلية برمجية (Callback Data) 
 * للتحكم الفوري بصفحة العميل (سواء المساهمة أو توليد الكارت)
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
🔔 *طلب دفع جديد (بانتظار قرار الإدارة)*
👤 *الهاتف:* ${paymentData.phone || "غير محدد"}
💰 *المبلغ:* ${amount} جنيه
🌐 *الفرع:* ${paymentData.branchName || "فرع حكايات نت"}
🔢 *رقم المعاملة:* \`${transactionId}\`
📌 *النوع:* ${isContribution ? "🌸 مساهمة ودعم للشبكة" : "🎟️ باقة إنترنت ميكروتيك"}
  `.trim();

  const serverBaseUrl = process.env.SERVER_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://your-app.onrender.com";

  let inlineKeyboardButtons = [];

  if (isContribution) {
    inlineKeyboardButtons = [
      [
        {
          text: "🌸 فتح صفحة المساهمة والدعاء للعميل",
          callback_data: `show_contrib_${transactionId}_${amount}`
        }
      ]
    ];
  } else {
    inlineKeyboardButtons = [
      [
        {
          text: "⚙️ توليد كارت الميكروتيك وتفعيله",
          callback_data: `approve_card_${transactionId}_${branchKey}_${amount}`
        }
      ]
    ];
  }

  inlineKeyboardButtons.push([
    {
      text: "🔍 معاينة صفحة الانتظار",
      url: `${serverBaseUrl}/success?merchant_order_id=${transactionId}&branch=${branchKey}`
    }
  ]);

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: messageText,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: inlineKeyboardButtons }
    });
    console.log("✅ تم إرسال إشعار تليجرام مع الأزرار التفاعلية بنجاح.");
  } catch (error) {
    console.error("❌ فشل إرسال إشعار تليجرام للأزرار:", error.response?.data || error.message);
  }
}

/**
 * معالجة ضغطات الأزرار من تليجرام وتنبيه صفحة العميل فوراً
 */
async function handleTelegramCallback(callbackQuery, io) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const data = callbackQuery.data;
  const callbackQueryId = callbackQuery.id;

  try {
    // تهيئة مصفوفة التخزين المؤقت إن لم تكن موجودة
    if (!global.generatedCardsMap) {
      global.generatedCardsMap = new Map();
    }

    // 1. معالجة زر إظهار صفحة المساهمة (الآن تخبرك بـ "تم التفعيل" بصورة منبثقة واضحة)
    if (data.startsWith('show_contrib_')) {
      const parts = data.replace('show_contrib_', '').split('_');
      const txId = parts[0];
      const amount = parts[1] || "150";

      // توجيه العميل إلى مسار صفحة المساهمة الفعلية التي تستخدم contributionMessages.js
      const redirectUrl = `/contribution-success?amount=${encodeURIComponent(amount)}&tx=${encodeURIComponent(txId)}`;

      // تخزين الحالة للـ Polling
      global.generatedCardsMap.set(txId, {
        isContribution: true,
        redirectUrl: redirectUrl,
        amount: amount,
        createdAt: new Date()
      });

      // إرسال تنبيه فوري عبر Socket.io للمتصفح المفتوح لنفس رقم المعاملة ليتحول تلقائياً
      if (io) {
        io.to(txId).emit('force_redirect', { url: redirectUrl });
      }

      // إخبار المسؤول في تليجرام بنجاح العملية عبر نافذة منبثقة (Alert)
      await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQueryId,
        text: `✅ تم التفعيل بنجاح! تم فتح صفحة المساهمة (${amount} ج) أمام العميل الآن.`,
        show_alert: true // ستظهر نافذة منبثقة للمشرف تؤكد التفعيل
      });
      console.log(`🚀 تم توجيه المعاملة ${txId} إلى صفحة المساهمة بنجاح.`);
    }

    // 2. معالجة زر إصدار وتوليد كارت الميكروتيك
    else if (data.startsWith('approve_card_')) {
      const parts = data.replace('approve_card_', '').split('_');
      const txId = parts[0];
      const branch = parts[1] || 'main';
      const amount = parts[2] || '5';

      const voucherCode = "HS-" + Math.floor(100000 + Math.random() * 900000);

      // تخزين الكارت للـ Polling
      global.generatedCardsMap.set(txId, {
        code: voucherCode,
        amount: amount,
        createdAt: new Date()
      });

      // إرسال الكارت فوراً عبر Socket.io للمتصفح
      if (io) {
        io.to(txId).emit('voucher_ready', { code: voucherCode, amount: amount });
      }

      await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQueryId,
        text: `✅ تم التفعيل بنجاح! كود الكارت: ${voucherCode}`,
        show_alert: true
      });
      console.log(`🎟️ تم توليد كارت الميكروتيك للمعاملة ${txId}: ${voucherCode}`);
    }

  } catch (err) {
    console.error("❌ خطأ في معالجة أزرار تليجرام:", err.response?.data || err.message);
  }
}

module.exports = {
  sendPaymentNotificationWithButtons,
  handleTelegramCallback
};
