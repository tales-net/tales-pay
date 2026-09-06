const axios = require('axios');
const { processPaymentAndCreateCard } = require('./mikrotikService');
const { generateContributionHtmlPage } = require('./contributionMessages');

/**
 * إرسال إشعار تليجرام مع زرين تفاعليين يدويين مرتبطين برقم المعاملة
 * @param {Object} paymentData - بيانات الطلب أو الدفع
 * @param {string} transactionId - رقم المعاملة الفريد
 */
async function sendTelegramManualButtons(paymentData, transactionId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("⚠️ توكن تليجرام أو معرف الشات غير متاح للإشعارات اليدوية.");
    return;
  }

  const amount = paymentData.amount_cents ? paymentData.amount_cents / 100 : (paymentData.amount || 5);
  const branch = paymentData.branch || paymentData.branchKey || "main";
  const phone = paymentData.phone || "غير محدد";
  const serverBaseUrl = process.env.SERVER_BASE_URL || "https://tales-pay.onrender.com";

  const messageText = `
⚠️ *طلب دفع جديد / كارت إنترنت / مساهمة (يدوي)*
━━━━━━━━━━━━━━━━━━━━
📱 *الهاتف:* \`${phone}\`
💰 *المبلغ:* *${amount} جنيه*
🌐 *الفرع:* ${branch}
🔢 *رقم العملية:* \`${transactionId}\`
━━━━━━━━━━━━━━━━━━━━
*(اختر الإجراء المناسب يدويًا من الأزرار أدناه)*
  `.trim();

  // أزرار تفاعلية (Callback Data) لتحديث صفحة العميل فوراً بالضغط دون مغادرة التليجرام
  const inlineKeyboard = {
    inline_keyboard: [
      [
        {
          text: "🌟 صفحة المساهمة",
          callback_data: `action_contrib_${amount}_${transactionId}`
        },
        {
          text: "💳 إصدار الكارت المرتبط",
          callback_data: `action_card_${amount}_${branch}_${transactionId}`
        }
      ]
    ]
  };

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: messageText,
      parse_mode: "Markdown",
      reply_markup: inlineKeyboard
    });
    console.log(`✅ تم إرسال رسالة الأزرار اليدوية لتليجرام برقم العملية: ${transactionId}`);
  } catch (error) {
    console.error("❌ خطأ في إرسال الأزرار اليدوية لتليجرام:", error.response?.data || error.message);
  }
}

/**
 * معالجة ضغطات الأزرار القادمة من تليجرام (Callback Query) وتحديث شاشة العميل فورا
 * @param {Object} botIo - كائن Socket.io لإرسال التحديث للعميل
 * @param {Object} callbackQuery - بيانات الضغطة من تليجرام
 */
async function handleTelegramCallback(botIo, callbackQuery) {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!data) return;

  try {
    if (data.startsWith('action_contrib_')) {
      const [, amountStr, txId] = data.split('_');
      const amount = parseFloat(amountStr);

      // توليد محتوى صفحة المساهمة
      const htmlContent = generateContributionHtmlPage(amount, txId);

      // إرسال التحديث الفوري للعميل المفتوح لديه صفحة الانتظار برقم txId
      if (botIo) {
        botIo.to(txId).emit('telegram-action-result', {
          success: true,
          isContribution: true,
          htmlContent: htmlContent
        });
      }

      // الرد على التليجرام لتأكيد نجاح الضغطة
      await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQuery.id,
        text: "✅ تم توجيه العميل لصفحة المساهمة بنجاح",
        show_alert: false
      });

      // تعديل رسالة تليجرام لإظهار أنه تم التنفيذ
      await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text: callbackQuery.message.text + "\n\n✅ *[تم اختيار: صفحة المساهمة]*",
        parse_mode: "Markdown"
      });

    } else if (data.startsWith('action_card_')) {
      const [, amountStr, branch, txId] = data.split('_');
      const amount = parseFloat(amountStr);

      // توليد الكارت عبر الميكروتيك
      const result = await processPaymentAndCreateCard(amount, branch, txId);

      if (result.isContribution) {
        const htmlContent = generateContributionHtmlPage(amount, txId);
        if (botIo) {
          botIo.to(txId).emit('telegram-action-result', {
            success: true,
            isContribution: true,
            htmlContent: htmlContent
          });
        }
      } else {
        // حفظ الكارت في الخريطة ليتمكن العميل من رؤيته
        if (global.generatedCardsMap) {
          global.generatedCardsMap.set(txId, {
            code: result.cardCode,
            packageName: result.packageName,
            amount: amount,
            branchKey: branch,
            createdAt: new Date()
          });
        }

        // إرسال تفاصيل الكارت للعميل عبر Socket.io لتحديث الشاشة فوراً
        if (botIo) {
          botIo.to(txId).emit('telegram-action-result', {
            success: true,
            isContribution: false,
            cardCode: result.cardCode,
            packageName: result.packageName
          });
        }
      }

      // الرد على تليجرام
      await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQuery.id,
        text: "✅ تم إصدار الكارت وإرساله لشاشة العميل بنجاح",
        show_alert: false
      });

      // تعديل رسالة تليجرام
      await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text: callbackQuery.message.text + `\n\n✅ *[تم إصدار الكارت بنجاح: ${result.cardCode || 'مساهمة'}]*`,
        parse_mode: "Markdown"
      });
    }
  } catch (error) {
    console.error("❌ خطأ في معالجة ضغطة زر تليجرام:", error.response?.data || error.message);
    await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      callback_query_id: callbackQuery.id,
      text: "❌ حدث خطأ أثناء تنفيذ الطلب",
      show_alert: true
    }).catch(() => {});
  }
}

module.exports = { sendTelegramManualButtons, handleTelegramCallback };
