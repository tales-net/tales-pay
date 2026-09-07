/**
 * توليد صفحة الانتظار للعميل مع خاصية التحديث الفوري (Live Update) 
 * لتتحول إلى صفحة المساهمة فور ضغط الإدارة في تليجرام دون إعادة تحميل الصفحة.
 */
function generateWaitPageHtml(transactionId, networkUrl) {
  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>جاري معالجة الدفع - شبكة حكايات</title>
      <script src="/socket.io/socket.io.js"></script>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
          color: #ffffff;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
          text-align: center;
        }
        .card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(241, 196, 15, 0.3);
          border-radius: 20px;
          padding: 40px 30px;
          max-width: 550px;
          width: 100%;
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.5);
          transition: all 0.5s ease-in-out;
        }
        .spinner {
          width: 60px;
          height: 60px;
          border: 6px solid rgba(255, 255, 255, 0.3);
          border-top: 6px solid #f1c40f;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 25px auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        h2 { color: #f1c40f; margin-bottom: 15px; font-size: 24px; }
        p { color: #e0e0e0; font-size: 16px; line-height: 1.6; margin-bottom: 20px; }
        .tx-id { font-size: 13px; color: #b2bec3; margin-top: 15px; }

        /* تنسيقات صفحة المساهمة الحية (تظهر عند التفعيل) */
        .icon-box {
          font-size: 60px;
          margin-bottom: 20px;
          animation: bounce 2s infinite;
        }
        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% {transform: translateY(0);}
          40% {transform: translateY(-10px);}
          60% {transform: translateY(-5px);}
        }
        .amount-badge {
          display: inline-block;
          background: linear-gradient(45deg, #f1c40f, #f39c12);
          color: #111;
          font-size: 20px;
          font-weight: bold;
          padding: 8px 22px;
          border-radius: 50px;
          margin: 15px 0;
          box-shadow: 0 5px 15px rgba(241, 196, 15, 0.4);
        }
        .message-box {
          background: rgba(0, 0, 0, 0.25);
          border-right: 5px solid #2ecc71;
          padding: 20px;
          border-radius: 10px;
          margin: 20px 0;
          font-size: 17px;
          line-height: 1.8;
          color: #ecf0f1;
          text-align: right;
        }
        .footer-note {
          margin-top: 20px;
          font-size: 15px;
          color: #2ecc71;
          font-weight: bold;
          border-top: 1px dashed rgba(255, 255, 255, 0.2);
          padding-top: 15px;
        }
        .btn-home {
          display: inline-block;
          margin-top: 20px;
          background: transparent;
          border: 2px solid #f1c40f;
          color: #f1c40f;
          padding: 10px 30px;
          border-radius: 30px;
          text-decoration: none;
          font-weight: bold;
          transition: all 0.3s ease;
        }
        .btn-home:hover {
          background: #f1c40f;
          color: #111;
        }
        .hidden { display: none !important; }
      </style>
    </head>
    <body>
      <div class="card" id="main-card">
        
        <!-- حالة الانتظار الافتراضية -->
        <div id="loading-state">
          <div class="spinner"></div>
          <h2>جاري تأكيد عملية الدفع...</h2>
          <p id="status-text">يرجى الانتظار، يتم الآن مراجعة المعاملة وتوثيقها من الإدارة...</p>
          <div class="tx-id">رقم المعاملة: #${transactionId}</div>
        </div>

        <!-- حالة نجاح المساهمة (تظهر فوراً عند ضغط زر التليجرام دون ريفرش) -->
        <div id="contribution-state" class="hidden">
          <div class="icon-box">🌟</div>
          <h2 id="contrib-title">✨ مساهمة مباركة ودعم كريم ✨</h2>
          
          <div class="amount-badge" id="contrib-amount-text">
            مبلغ المساهمة: جاري التحميل...
          </div>

          <div class="message-box">
            <p id="contrib-message">جاري جلب الدعاء والرسالة...</p>
          </div>

          <div class="tx-id">رقم المعاملة: #${transactionId}</div>

          <div class="footer-note" id="contrib-footer">
            دمتم سباقين للخير، بارك الله في مالكم وأهليكم، لا تنسي الدعاء لوالدي
          </div>

          <div>
            <a href="/" class="btn-home">العودة للرئيسية</a>
          </div>
        </div>

      </div>

      <script>
        const txId = "${transactionId}";
        const socket = io();

        // عبارات الأدعية لتوليدها مباشرة في واجهة العميل عند التفعيل
        const blessings = [
          "جزاكم الله خيراً وجعل هذه المساهمة الطيبة في ميزان حسناتكم، وبارك لكم في مالكم وأهليكم.",
          "تقبل الله منا ومنكم صالح الأعمال، نسأل الله أن يبارك في عطائكم ويجعله صدقة جارية ونوراً في دربكم.",
          "بارك الله في جهودكم الكريمة ودعمكم المستمر، وجعل الله التوفيق والنجاح حليفكم دائماً وأبداً.",
          "نشكر لكم مساهمتكم المباركة، نسأل الله أن يخلف عليكم خيراً وأن يرزقكم من حيث لا تحتسبون."
        ];

        // الانضمام لغرفة المعاملة الخاصة بهذا العميل
        socket.emit('join_transaction', txId);

        // وظيفة لتحويل شكل الشاشة إلى شاشة المساهمة فوراً (بشبه نظام البث والدردشة الحية)
        function renderContributionView(amount) {
          document.getElementById('loading-state').classList.add('hidden');
          
          const contribState = document.getElementById('contribution-state');
          contribState.classList.remove('hidden');

          // تعبئة البيانات ديناميكياً
          document.getElementById('contrib-amount-text.innerText` = `مبلغ المساهمة: ${amount} جنيه`; // تصحيح صياغة النص
          
          const randomMsg = blessings[Math.floor(Math.random() * blessings.length)];
          document.getElementById('contrib-message').innerText = randomMsg;
          
          // تأثير بصري خفيف على الكارت
          document.getElementById('main-card').style.borderColor = '#2ecc71';
        }

        // إصلاح دالة تعبئة مبلغ المساهمة بدقة
        function showContribution(amount) {
          document.getElementById('loading-state').classList.add('hidden');
          document.getElementById('contribution-state').classList.remove('hidden');
          document.getElementById('contrib-amount-text').innerText = "مبلغ المساهمة: " + amount + " جنيه";
          
          const randomMsg = blessings[Math.floor(Math.random() * blessings.length)];
          document.getElementById('contrib-message').innerText = randomMsg;
        }

        // 1. الاستماع للبث الفوري عبر Socket.io (تحديث حي تماماً مثل الشات)
        socket.on('force_redirect', function(data) {
          if (data && data.url) {
            // استخراج المبلغ من الـ URL أو افتراض قيمة إن لم تتوفر
            const urlParams = new URLSearchParams(data.url.split('?')[1]);
            const amt = urlParams.get('amount') || '150';
            showContribution(amt);
          }
        });

        socket.on('voucher_ready', function(data) {
          window.location.href = "/success?merchant_order_id=" + txId;
        });

        // 2. الفحص الدوري (Polling) للتأكد في حال انقطاع الـ Socket
        setInterval(async () => {
          try {
            const response = await fetch('/api/check-voucher/' + txId);
            const result = await response.json();
            
            if (result.success && result.data) {
              if (result.data.isContribution) {
                const amt = result.data.amount || '150';
                showContribution(amt);
              } else if (result.data.code) {
                window.location.href = "/success?merchant_order_id=" + txId;
              }
            } else {
              // إظهار تنبيه يشبه "جاري الكتابة..." في الدعم الفني
              document.getElementById('status-text').innerText = "جاري مراجعة الإدارة وتجهيز رسالة الشكر والمساهمة...";
            }
          } catch (e) {
            console.error("Polling error...", e);
          }
        }, 3000);
      </script>
    </body>
    </html>
  `;
}

module.exports = {
  generateWaitPageHtml
};
