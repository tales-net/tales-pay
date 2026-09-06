const axios = require('axios');
const { processPaymentAndCreateCard } = require('./mikrotikService');
const { generateContributionHtmlPage } = require('./contributionMessages');

/**
 * إرسال إشعار تليجرام مع زرين تفاعليين يدويين مرتبطين برقم المعاملة
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
⚠️ طلب دفع جديد / فشلت المحفظة (تدوي)
------------------------------------
📱 الهاتف: ${phone}
💰 المبلغ: ${amount} جنيه
🌐 الفرع: ${branch}
🔢 رقم العملية: ${transactionId}
------------------------------------
(اختر الإجراء المناسب يدويًا)
  `.trim();

  // أزرار تفاعلية ترسل بيانات نظيفة بدون رموز تكسر الماركداون
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
      reply_markup: inlineKeyboard
    });
    console.log(`✅ تم إرسال رسالة الأزرار اليدوية لتليجرام برقم العملية: ${transactionId}`);
  } catch (error) {
    console.error("❌ خطأ في إرسال الأزرار اليدوية لتليجرام:", error.response?.data || error.message);
  }
}

/**
 * معالجة ضغطات الأزرار القادمة من تليجرام وتحديث شاشة العميل فورا
 */
async function handleTelegramCallback(botIo, callbackQuery) {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!data) return;

  try {
    if (data.startsWith('action_contrib_')) {
      const parts = data.split('_');
      const txId = parts[parts.length - 1]; // استخراج رقم المعاملة بدقة من الأخير
      const amountStr = parts[2];
      const amount = parseFloat(amountStr);

      const htmlContent = generateContributionHtmlPage(amount, txId);

      if (botIo) {
        botIo.to(txId).emit('telegram-action-result', {
          success: true,
          isContribution: true,
          htmlContent: htmlContent
        });
      }

      await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQuery.id,
        text: "✅ تم توجيه العميل لصفحة المساهمة بنجاح",
        show_alert: false
      });

      await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text: callbackQuery.message.text + "\n\n[تم اختيار: صفحة المساهمة بنجاح ✅]"
      });

    } else if (data.startsWith('action_card_')) {
      const parts = data.split('_');
      const txId = parts[parts.length - 1]; // رقم المعاملة الأخير
      const branch = parts[parts.length - 2]; // الفرع قبل الأخير
      const amountStr = parts[2];
      const amount = parseFloat(amountStr);

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
        if (global.generatedCardsMap) {
          global.generatedCardsMap.set(txId, {
            code: result.cardCode,
            packageName: result.packageName,
            amount: amount,
            branchKey: branch,
            createdAt: new Date()
          });
        }

        if (botIo) {
          botIo.to(txId).emit('telegram-action-result', {
            success: true,
            isContribution: false,
            cardCode: result.cardCode,
            packageName: result.packageName
          });
        }
      }

      await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQuery.id,
        text: "✅ تم إصدار الكارت وإرساله لشاشة العميل",
        show_alert: false
      });

      await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text: callbackQuery.message.text + `\n\n[تم إصدار الكارت: ${result.cardCode || 'مساهمة'} ✅]`
      });
    }
  } catch (error) {
    console.error("❌ خطأ في معالجة ضغطة زر تليجرام:", error.response?.data || error.message);
    await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      callback_query_id: callbackQuery.id,
      text: "❌ حدث خطأ أثناء تنفيذ الطلب: " + (error.message || ""),
      show_alert: true
    }).catch(() => {});
  }
}

module.exports = { sendTelegramManualButtons, handleTelegramCallback };
