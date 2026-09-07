const axios = require('axios');
const { processPaymentAndCreateCard } = require('./mikrotikService');
const { generateContributionHtmlPage } = require('./contributionMessages');

/**
 * إرسال إشعار تليجرام مع زرين تفاعليين يدويين مرتبطين برقم المعاملة الحقيقي
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

  const messageText = `
⚠️ طلب دفع جديد / فشلت المحفظة (يدوي)
------------------------------------
📱 الهاتف: ${phone}
💰 المبلغ: ${amount} جنيه
🌐 الفرع: ${branch}
🔢 رقم العملية: ${transactionId}
------------------------------------
(اختر الإجراء المناسب يدويًا)
  `.trim();

  // استخدام صيغة بسيطة ومستقرة لـ callback_data بدون تقطيع معقد
  const inlineKeyboard = {
    inline_keyboard: [
      [
        {
          text: "🌟 صفحة المساهمة",
          callback_data: `contrib|${amount}|${transactionId}`
        },
        {
          text: "💳 إصدار الكارت المرتبط",
          callback_data: `card|${amount}|${branch}|${transactionId}`
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
 * معالجة ضغطات الأزرار القادمة من تليجرام وتحديث شاشة العميل فوراً عبر السوكيت
 */
async function handleTelegramCallback(botIo, callbackQuery) {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!data) return;

  try {
    if (data.startsWith('contrib|')) {
      const parts = data.split('|');
      const amount = parseFloat(parts[1]);
      const txId = parts[2];

      const htmlContent = generateContributionHtmlPage(amount, txId);

      // إرسال صفحة المساهمة عبر السوكيت للغرفة الخاصة برقم المعاملة الحقيقي
      if (botIo) {
        botIo.to(txId).emit('telegram-action-result', {
          success: true,
          isContribution: true,
          htmlContent: htmlContent
        });
        console.log(`📡 تم إرسال حدث المساهمة عبر Socket للغرفة: ${txId}`);
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

    } else if (data.startsWith('card|')) {
      const parts = data.split('|');
      const amount = parseFloat(parts[1]);
      const branch = parts[2];
      const txId = parts[3];

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

        // إرسال الكارت عبر السوكيت للغرفة الخاصة برقم المعاملة الحقيقي لتظهر بالنافذة المنبثقة
        if (botIo) {
          botIo.to(txId).emit('telegram-action-result', {
            success: true,
            isContribution: false,
            cardCode: result.cardCode,
            packageName: result.packageName
          });
          console.log(`📡 تم إرسال كارت الميكروتيك عبر Socket للغرفة: ${txId}`);
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
