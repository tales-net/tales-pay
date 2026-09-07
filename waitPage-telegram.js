const axios = require('axios');

/**
 * إرسال إشعار إلى التليجرام مع أزرار تفاعلية برمجية (Callback Data) 
 */
async function sendPaymentNotificationWithButtons(paymentData, transactionId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error("⚠️ توكن التليجرام أو معرف الشات (Chat ID) غير متوفر في ملف البيئة .env");
    return;
  }

  const amount = paymentData.amount_cents ? paymentData.amount_cents / 100 : (paymentData.amount || 5);
  const isContribution = amount > 100; // اعتباره مساهمة إذا كان المبلغ أكبر من 100
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
          text: "🌸 تفعيل وعرض صفحة المساهمة للعميل",
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
 * معالجة ضغطات الأزرار من تليجرام وبث التحديث الفوري للعميل
 */
async function handleTelegramCallback(callbackQuery, io) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const data = callbackQuery.data;
  const callbackQueryId = callbackQuery.id;

  try {
    if (!global.generatedCardsMap) {
      global.generatedCardsMap = new Map();
    }

    // 1. معالجة زر إظهار صفحة المساهمة الفورية
    if (data.startsWith('show_contrib_')) {
      const parts = data.replace('show_contrib_', '').split('_');
      const txId = parts[0];
      const amount = parts[1] || "150";

      const redirectUrl = `/contribution-success?amount=${encodeURIComponent(amount)}&tx=${encodeURIComponent(txId)}`;

      // تخزين الحالة في الذاكرة ليتم التقاطها عبر الـ Polling أو الـ Socket
      global.generatedCardsMap.set(txId, {
        isContribution: true,
        redirectUrl: redirectUrl,
        amount: amount,
        createdAt: new Date()
      });

      // بث إشارة التحديث اللحظي للعميل عبر Socket.io (تظهر فوراً دون إعادة تحميل)
      if (io) {
        io.to(txId).emit('force_redirect', { url: redirectUrl, amount: amount });
      }

      // تنبيه المشرف في تليجرام بنجاح العملية
      await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQueryId,
        text: `✅ تم تفعيل وإرسال صفحة المساهمة (${amount} ج) أمام العميل بنجاح!`,
        show_alert: true
      });
      console.log(`🚀 تم تفعيل المساهمة للمعاملة ${txId} بقيمة ${amount} جنيه.`);
    }

    // 2. معالجة زر إصدار كارت الميكروتيك العادي
    else if (data.startsWith('approve_card_')) {
      const parts = data.replace('approve_card_', '').split('_');
      const txId = parts[0];
      const branch = parts[1] || 'main';
      const amount = parts[2] || '5';

      const voucherCode = "HS-" + Math.floor(100000 + Math.random() * 900000);

      global.generatedCardsMap.set(txId, {
        code: voucherCode,
        amount: amount,
        createdAt: new Date()
      });

      if (io) {
        io.to(txId).emit('voucher_ready', { code: voucherCode, amount: amount });
      }

      await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQueryId,
        text: `✅ تم توليد الكارت بنجاح: ${voucherCode}`,
        show_alert: true
      });
      console.log(`🎟️ تم توليد الكارت للمعاملة ${txId}: ${voucherCode}`);
    }

  } catch (err) {
    console.error("❌ خطأ في معالجة أزرار تليجرام:", err.response?.data || err.message);
  }
}

module.exports = {
  sendPaymentNotificationWithButtons,
  handleTelegramCallback
};
