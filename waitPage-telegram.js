const axios = require('axios');
const { processPaymentAndCreateCard } = require('./mikrotikService');
const { generateContributionHtmlPage } = require('./contributionMessages');

/**
 * إرسال إشعار تليجرام مع زرين تفاعليين (صفحة المساهمة أو إصدار كارت ميكروتيك)
 */
async function sendPaymentNotificationWithButtons(paymentData, transactionId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("⚠️ توكن التليجرام أو معرف الشات (Chat ID) غير متوفر في ملف البيئة .env");
    return;
  }

  const amount = paymentData.amount_cents ? paymentData.amount_cents / 100 : (paymentData.amount || 5);
  const isContribution = amount > 100; // اعتباره مساهمة إذا كان المبلغ أكبر من 100
  const branchKey = paymentData.branch || paymentData.branch_key || 'main';
  const phone = paymentData.phone || "غير محدد";

  const messageText = `
🔔 *طلب دفع جديد (بانتظار قرار الإدارة)*
------------------------------------
👤 *الهاتف:* ${phone}
💰 *المبلغ:* ${amount} جنيه
🌐 *الفرع:* ${paymentData.branchName || branchKey}
🔢 *رقم المعاملة:* \`${transactionId}\`
📌 *النوع:* ${isContribution ? "🌸 مساهمة ودعم للشبكة" : "🎟️ باقة إنترنت ميكروتيك"}
------------------------------------
(اختر الإجراء المناسب أدناه)
  `.trim();

  // استخدام صيغة مستقرة لـ callback_data بدون تقطيع معقد
  const inlineKeyboard = {
    inline_keyboard: [
      [
        {
          text: "🌟 صفحة المساهمة",
          callback_data: `contrib|${amount}|${transactionId}`
        },
        {
          text: "💳 إصدار الكارت المرتبط",
          callback_data: `card|${amount}|${branchKey}|${transactionId}`
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
    console.log(`✅ تم إرسال إشعار تليجرام مع الأزرار التفاعلية بنجاح برقم المعاملة: ${transactionId}`);
  } catch (error) {
    console.error("❌ فشل إرسال إشعار تليجرام للأزرار:", error.response?.data || error.message);
  }
}

/**
 * معالجة ضغطات الأزرار القادمة من تليجرام وتحديث شاشة العميل فوراً عبر السوكيت أو الذاكرة
 */
async function handleTelegramCallback(callbackQuery, io) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const data = callbackQuery.data;
  const callbackQueryId = callbackQuery.id;
  
  if (!callbackQuery.message) return;
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  if (!data) return;

  try {
    if (!global.generatedCardsMap) {
      global.generatedCardsMap = new Map();
    }

    // 1. معالجة زر صفحة المساهمة
    if (data.startsWith('contrib|')) {
      const parts = data.split('|');
      const amount = parseFloat(parts[1]) || 150;
      const txId = parts[2];

      const htmlContent = generateContributionHtmlPage ? generateContributionHtmlPage(amount, txId) : `<div>مساهمة بقيمة ${amount}</div>`;
      const redirectUrl = `/contribution-success?amount=${encodeURIComponent(amount)}&tx=${encodeURIComponent(txId)}`;

      // تخزين الحالة في الذاكرة لتلتقطها صفحة الانتظار عبر الـ Polling
      global.generatedCardsMap.set(txId, {
        isContribution: true,
        redirectUrl: redirectUrl,
        amount: amount,
        createdAt: new Date()
      });

      // بث إشارة التحديث اللحظي للعميل عبر Socket.io للغرفة الخاصة برقم المعاملة
      if (io) {
        io.to(txId).emit('force_redirect', { url: redirectUrl, amount: amount });
        io.to(txId).emit('telegram-action-result', {
          success: true,
          isContribution: true,
          htmlContent: htmlContent,
          url: redirectUrl
        });
        console.log(`📡 تم إرسال حدث المساهمة عبر Socket للغرفة: ${txId}`);
      }

      // الرد على التليجرام لإيقاف علامة التحميل على الزر
      await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQueryId,
        text: `✅ تم توجيه العميل لصفحة المساهمة (${amount} ج) بنجاح!`,
        show_alert: false
      });

      // تحديث رسالة البوت لتوضيح أنه تم اختيار هذا الخيار
      await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text: callbackQuery.message.text + "\n\n[تم اختيار: تفعيل صفحة المساهمة ✅]",
        parse_mode: "Markdown"
      }).catch(() => {});

      console.log(`🚀 تم تفعيل المساهمة للمعاملة ${txId} بقيمة ${amount} جنيه.`);
    }

    // 2. معالجة زر إصدار كارت الميكروتيك
    else if (data.startsWith('card|')) {
      const parts = data.split('|');
      const amount = parseFloat(parts[1]) || 5;
      const branch = parts[2] || 'main';
      const txId = parts[3];

      // محاولة إصدار الكارت عبر خدمة الميكروتيك إذا كانت متاحة، أو توليد كارت افتراضي احتياطي
      let voucherCode, packageName;
      if (typeof processPaymentAndCreateCard === 'function') {
        const result = await processPaymentAndCreateCard(amount, branch, txId);
        if (result && result.isContribution) {
          // لو تبين لاحقاً أنه مساهمة
          const htmlContent = generateContributionHtmlPage ? generateContributionHtmlPage(amount, txId) : '';
          if (io) {
            io.to(txId).emit('telegram-action-result', { success: true, isContribution: true, htmlContent });
          }
          return;
        }
        voucherCode = result?.cardCode || ("HS-" + Math.floor(100000 + Math.random() * 900000));
        packageName = result?.packageName || "باقة إنترنت";
      } else {
        voucherCode = "HS-" + Math.floor(100000 + Math.random() * 900000);
        packageName = "باقة إنترنت";
      }

      // تخزين الكارت في الذاكرة لفحصه عبر الـ Polling من صفحة الانتظار
      global.generatedCardsMap.set(txId, {
        code: voucherCode,
        packageName: packageName,
        amount: amount,
        branchKey: branch,
        createdAt: new Date()
      });

      // بث الكارت عبر السوكيت للغرفة الخاصة برقم المعاملة
      if (io) {
        io.to(txId).emit('voucher_ready', { code: voucherCode, amount: amount, packageName });
        io.to(txId).emit('telegram-action-result', {
          success: true,
          isContribution: false,
          cardCode: voucherCode,
          packageName: packageName
        });
        console.log(`📡 تم إرسال كارت الميكروتيك (${voucherCode}) عبر Socket للغرفة: ${txId}`);
      }

      await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        callback_query_id: callbackQueryId,
        text: `✅ تم توليد الكارت بنجاح: ${voucherCode}`,
        show_alert: true
      });

      await axios.post(`https://api.telegram.org/bot${token}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text: callbackQuery.message.text + `\n\n[تم إصدار الكارت: ${voucherCode} ✅]`,
        parse_mode: "Markdown"
      }).catch(() => {});

      console.log(`🎟️ تم توليد الكارت للمعاملة ${txId}: ${voucherCode}`);
    }

  } catch (err) {
    console.error("❌ خطأ في معالجة أزرار تليجرام:", err.response?.data || err.message);
    await axios.post(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      callback_query_id: callbackQueryId,
      text: "❌ حدث خطأ أثناء تنفيذ الطلب.",
      show_alert: true
    }).catch(() => {});
  }
}

/**
 * توليد صفحة الانتظار وتأكيد الدفع مع التحديث الحي التلقائي (Polling + Socket)
 */
function generateWaitPageHtml(transactionId, networkUrl) {
  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>جاري تقديم الطلب - شبكة حكايات</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Tahoma, Cairo, sans-serif; background: #f4f7fb; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px 15px; direction: rtl; }
          .card-container { background: #ffffff; max-width: 460px; width: 100%; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); padding: 30px 25px; text-align: center; border: 1px solid #eef2f7; position: relative; }
          
          .icon-wrapper { position: relative; width: 85px; height: 85px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; }
          .pulse-circle { position: absolute; width: 100%; height: 100%; border-radius: 50%; background: rgba(1, 51, 141, 0.12); animation: pulse 2s infinite ease-in-out; }
          .icon-inner { position: relative; font-size: 38px; color: #01338D; z-index: 1; }
          
          @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.8; }
            50% { transform: scale(1.18); opacity: 0.25; }
            100% { transform: scale(0.95); opacity: 0.8; }
          }

          h1 { color: #1e293b; font-size: 21px; font-weight: 700; margin-bottom: 12px; }
          p.subtitle { color: #475569; font-size: 14.5px; line-height: 1.7; margin-bottom: 20px; font-weight: 500; }

          .highlight-action { background: #eff6ff; border: 1px dashed #3b82f6; color: #1d4ed8; padding: 12px 15px; border-radius: 12px; font-size: 14px; font-weight: 700; margin-bottom: 22px; display: flex; align-items: center; justify-content: center; gap: 8px; }

          .info-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 20px; text-align: right; }
          .info-row { display: flex; justify-content: space-between; font-size: 13.5px; margin-bottom: 8px; color: #475569; }
          .info-row:last-child { margin-bottom: 0; }
          .info-row strong { color: #0f172a; font-weight: 600; }

          .status-badge { display: inline-flex; align-items: center; gap: 8px; background: #fff7ed; color: #c2410c; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; border: 1px solid #ffedd5; }
          .status-dot { width: 8px; height: 8px; background: #f97316; border-radius: 50%; display: inline-block; animation: blink 1.5s infinite; }
          @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

          .manual-actions { display: flex; gap: 10px; margin-top: 15px; }
          .btn-custom { flex: 1; padding: 10px; border-radius: 8px; font-size: 13px; font-weight: bold; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; transition: 0.2s; border: none; }
          .btn-contrib { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
          .btn-contrib:hover { background: #e2e8f0; }
          .btn-card-gen { background: #01338D; color: white; }
          .btn-card-gen:hover { background: #002266; }

          .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.65); z-index: 1000; align-items: center; justify-content: center; padding: 15px; backdrop-filter: blur(4px); }
          .modal-box { background: #ffffff; border-radius: 20px; padding: 25px; width: 100%; max-width: 400px; text-align: center; box-shadow: 0 15px 35px rgba(0,0,0,0.25); animation: slideUp 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
          @keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          
          .voucher-code { background: #f0f9ff; color: #0369a1; font-size: 26px; font-weight: bold; font-family: monospace; padding: 14px; border-radius: 12px; margin: 15px 0; letter-spacing: 2px; border: 1px dashed #0284c7; }
          .btn-copy { background: #01338D; color: white; border: none; padding: 13px; width: 100%; border-radius: 10px; font-weight: bold; cursor: pointer; font-size: 14.5px; transition: 0.2s; }
          .btn-copy:hover { background: #002266; }
        </style>
      </head>
      <body>
        <div class="card-container">
          <div class="icon-wrapper">
            <div class="pulse-circle"></div>
            <div class="icon-inner"><i class="fa fa-clock-o"></i></div>
          </div>
          
          <h1>جاري مراجعة طلب الدفع...</h1>
          <p class="subtitle">بمجرد اعتماد الإدارة لعملية الدفع من البوت، سيظهر الكارت هنا أو سيتم توجيهك للمساهمة تلقائياً.</p>

          <div class="highlight-action">
            <i class="fa fa-bell" style="font-size: 16px;"></i>
            <span>الرجاء الانتظار، يتم فحص حالة الطلب بشكل لحظي...</span>
          </div>

          <div class="info-box">
            <div class="info-row">
              <span>حالة الطلب:</span>
              <span class="status-badge"><span class="status-dot"></span> بانتظار موافقة البوت</span>
            </div>
            <div class="info-row" style="margin-top: 10px;">
              <span>رقم المعاملة:</span>
              <strong>${transactionId}</strong>
            </div>
          </div>

          <div class="manual-actions">
            <a href="/contribution-success?amount=150&tx=${transactionId}" class="btn-custom btn-contrib">
              <i class="fa fa-heart"></i> صفحة المساهمة
            </a>
            <a href="/success?merchant_order_id=${transactionId}" class="btn-custom btn-card-gen">
              <i class="fa fa-ticket"></i> تحديث / فحص الكارت
            </a>
          </div>
        </div>

        <!-- نافذة عرض الكارت عند توليده -->
        <div class="modal-overlay" id="voucherModal">
          <div class="modal-box">
            <div style="font-size: 45px; color: #16a34a; margin-bottom: 8px;"><i class="fa fa-check-circle"></i></div>
            <h2 style="font-size: 20px; color: #1e293b;">تمت الموافقة وإصدار الكارت!</h2>
            <p style="font-size: 13px; color: #64748b; margin-top: 5px;">كود التشغيل الخاص بك:</p>
            
            <div class="voucher-code" id="modalCardCode">------</div>
            
            <button class="btn-copy" onclick="copyCardCode()"><i class="fa fa-clone"></i> نسخ كود الكارت</button>
            <a href="${networkUrl || '#'}" style="display: block; margin-top: 14px; color: #64748b; text-decoration: none; font-size: 13px; font-weight: 600;">التوجه للتصفح الآن <i class="fa fa-arrow-left"></i></a>
          </div>
        </div>

        <!-- تضمين مكتبة Socket.io إن وجدت -->
        <script src="/socket.io/socket.io.js"></script>
        <script>
          const txId = "${transactionId}";
          let attempts = 0;

          // الربط الحي عبر Socket.io إن كان متاحاً في المشروع
          if (typeof io !== 'undefined') {
            const socket = io();
            socket.on('connect', () => {
              socket.emit('join_room', txId); // أو الانضمام التلقائي حسب إعدادات السيرفر
            });

            socket.on('force_redirect', (data) => {
              if (data && data.url) {
                window.location.href = data.url;
              }
            });

            socket.on('voucher_ready', (data) => {
              if (data && data.code) {
                document.getElementById('modalCardCode').innerText = data.code;
                document.getElementById('voucherModal').style.display = 'flex';
              }
            });

            socket.on('telegram-action-result', (data) => {
              if (data) {
                if (data.isContribution && data.url) {
                  window.location.href = data.url;
                } else if (data.isContribution && data.htmlContent) {
                  document.open();
                  document.write(data.htmlContent);
                  document.close();
                } else if (data.cardCode) {
                  document.getElementById('modalCardCode').innerText = data.cardCode;
                  document.getElementById('voucherModal').style.display = 'flex';
                }
              }
            });
          }

          // نظام احتياطي (Polling) لفحص حالة الكارت كل 3 ثوانٍ
          async function checkVoucherStatus() {
            if (!txId || txId === "غير محدد") return;
            try {
              attempts++;
              const res = await fetch('/api/check-voucher/' + encodeURIComponent(txId));
              const data = await res.json();
              
              if (data.success && data.data) {
                const cardAmount = parseFloat(data.data.amount || 0);

                // إذا كانت مساهمة، يتم تحويل العميل لصفحة المساهمة تلقائياً
                if (cardAmount > 100 || data.data.isContribution || data.data.redirectUrl) {
                  window.location.href = data.data.redirectUrl || ('/contribution-success?amount=' + cardAmount + '&tx=' + encodeURIComponent(txId));
                  return;
                }

                // إذا تم إصدار كارت ميكروتيك، تظهر النافذة المنبثقة بالكود فوراً
                if (data.data.code) {
                  document.getElementById('modalCardCode').innerText = data.data.code;
                  document.getElementById('voucherModal').style.display = 'flex';
                  return;
                }
              }
              
              if (attempts < 150) {
                setTimeout(checkVoucherStatus, 3000);
              }
            } catch (e) {
              if (attempts < 150) {
                setTimeout(checkVoucherStatus, 4000);
              }
            }
          }

          // بدء الفحص التلقائي بمجرد فتح الصفحة
          checkVoucherStatus();

          function copyCardCode() {
            const code = document.getElementById('modalCardCode').innerText;
            navigator.clipboard.writeText(code);
            alert("تم نسخ كود الكارت بنجاح!");
          }
        </script>
      </body>
    </html>
  `;
}

module.exports = {
  sendPaymentNotificationWithButtons,
  handleTelegramCallback,
  generateWaitPageHtml
};
