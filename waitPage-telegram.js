/**
 * waitPage-telegram.js
 * ملف مستقل لإدارة إشعارات صفحة الانتظار وأزرار التفاعل الخاصة بالمساهمة والكروت عبر تليجرام
 */

const axios = require("axios");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * إرسال رسالة صفحة الانتظار الأوليّة مع الأزرار التفاعلية
 */
async function sendWaitPageNotification(data) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn("⚠️ Telegram Bot Token or Chat ID is missing!");
      return;
    }

    const transactionId = data.transactionId || data.id || "TX_" + Date.now();
    const branchName = data.branchName || "حكايات نت رئيسي";
    const amountEGP = data.amount || "5";
    const userPhone = data.phone || "غير محدد";

    const message = `⏳ <b>بانتظار تأكيد الدفع (صفحة الانتظار نشطة)...</b>\n\n` +
                  `🏢 الفرع: <b>${branchName}</b>\n` +
                  `💰 المبلغ: <b>${amountEGP} جنيه</b>\n` +
                  `📱 رقم الهاتف: <code>${userPhone}</code>\n` +
                  `🆔 رقم المعاملة: <code>${transactionId}</code>\n` +
                  `----------------------------------------\n` +
                  `👇 <i>اختر الإجراء المناسب أدناه:</i>`;

    // الأزرار التفاعلية (إصدار الكارت أو إظهار صفحة المساهمة خفية للعميل)
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "🎟️ إصدار الكارت", callback_data: `approve_card_${transactionId}` },
          { text: "🌟 إظهار صفحة المساهمة للعميل", callback_data: `show_contribution_${transactionId}_${amountEGP}` }
        ]
      ]
    };

    const payload = {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
      reply_markup: replyMarkup
    };

    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, payload);
    if (response.data && response.data.ok) {
      console.log(`📤 [WaitPage Telegram] تم إرسال إشعار صفحة الانتظار بنجاح للمعاملة: ${transactionId}`);
    }
  } catch (err) {
    console.error("❌ [WaitPage Telegram Error]:", err.response?.data || err.message);
  }
}

/**
 * معالجة الضغط على أزرار التفاعل الخاصة بهذا الملف (مثل زر صفحة المساهمة)
 */
async function handleWaitPageCallback(callbackQuery, io) {
  try {
    const data = callbackQuery.data;
    const callbackQueryId = callbackQuery.id;

    if (data.startsWith('show_contribution_')) {
      const parts = data.replace('show_contribution_', '').split('_');
      const txId = parts[0];
      const amount = parts[1] || "150";

      // رابط صفحة المساهمة المطورة
      const redirectUrl = `/contribution-page?tx=${encodeURIComponent(txId)}&amount=${encodeURIComponent(amount)}`;

      // تخزين الحالة في الذاكرة لتلتقطها صفحة الانتظار خفية (عبر الـ Polling أو Socket)
      if (!global.generatedCardsMap) {
        global.generatedCardsMap = new Map();
      }
      global.generatedCardsMap.set(txId, {
        action: 'contribution',
        redirectUrl: redirectUrl,
        createdAt: new Date()
      });

      // إرسال إشارة الفتح الخفي للعميل عبر Socket.io
      if (io) {
        io.to(txId).emit('redirect_contribution', { url: redirectUrl });
        console.log(`🚀 [Socket.io] تم تفعيل العرض الخفي لصفحة المساهمة للمعاملة: ${txId}`);
      }

      // الرد على تليجرام لإزالة علامة التحميل من الزر
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        callback_query_id: callbackQueryId,
        text: "🌟 تم إرسال صفحة المساهمة لظهر العميل بنجاح!",
        show_alert: false
      });
    }
  } catch (err) {
    console.error("❌ [WaitPage Callback Error]:", err.response?.data || err.message);
  }
}

module.exports = {
  sendWaitPageNotification,
  handleWaitPageCallback
};
