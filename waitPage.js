/**
 * توليد صفحة الانتظار للعميل مع الاستماع لأوامر تليجرام (سواء لتوليد كارت أو فتح صفحة المساهمة)
 */
function generateWaitPageHtml(transactionId, networkUrl) {
  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>جاري معالجة الدفع - شبكة حكايات</title>
      <!-- مكتبة Socket.io للربط اللحظي مع السيرفر -->
      <script src="/socket.io/socket.io.js"></script>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #1d2671, #c33764);
          color: #ffffff;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
          text-align: center;
        }
        .card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          padding: 40px 30px;
          max-width: 450px;
          width: 100%;
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.4);
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
        
        /* زر الانتقال اليدوي للمساهمة في حال رغب العميل بالضغط عليه */
        .action-box {
          display: none;
          margin-top: 20px;
          animation: fadeIn 0.5s ease-in-out;
        }
        .btn-contrib {
          display: inline-block;
          background: linear-gradient(45deg, #f1c40f, #f39c12);
          color: #111;
          padding: 12px 25px;
          border-radius: 30px;
          text-decoration: none;
          font-weight: bold;
          font-size: 16px;
          box-shadow: 0 5px 15px rgba(241, 196, 15, 0.4);
          transition: transform 0.2s;
        }
        .btn-contrib:hover {
          transform: scale(1.05);
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div id="loading-section">
          <div class="spinner"></div>
          <h2>جاري تأكيد عملية الدفع...</h2>
          <p>يرجى الانتظار قليلاً، يتم الآن التحقق من محفظتك وتفعيل الخدمة أو المساهمة بواسطة الإدارة.</p>
          <div class="tx-id">رقم المعاملة: #${transactionId}</div>
        </div>

        <!-- قسم يظهر فور تفعيل المساهمة من تليجرام ويحتوي على زر مباشر -->
        <div id="success-action-section" class="action-box">
          <h2>🎉 تم اعتماد مساهمتك بنجاح!</h2>
          <p>شكراً لدعمك الكريم، اضغط على الزر أدناه لعرض رسالة الشكر والدعاء:</p>
          <a id="contrib-link" href="#" class="btn-contrib">عرض صفحة الدعاء والمساهمة 🌸</a>
        </div>
      </div>

      <script>
        const txId = "${transactionId}";
        const socket = io();

        // الانضمام لغرفة المعاملة الخاصة بهذا العميل
        socket.emit('join_transaction', txId);

        // 1. الاستماع لأمر التوجيه الإجباري القادم من تليجرام (عبر الـ Backend)
        socket.on('force_redirect', function(data) {
          if (data && data.url) {
            window.location.href = data.url;
          }
        });

        // 2. الاستماع لو حدث تفعيل ككارت ميكروتيك عادي
        socket.on('voucher_ready', function(data) {
          window.location.href = "/success?merchant_order_id=" + txId;
        });

        // 3. آلية احتياطية (Polling) تسأل السيرفر كل 3 ثوانٍ للاطمئنان على حالة الطلب
        setInterval(async () => {
          try {
            const response = await fetch('/api/check-voucher/' + txId);
            const result = await response.json();
            
            if (result.success && result.data) {
              // إذا كانت مساهمة وتم تفعيلها
              if (result.data.isContribution && result.data.redirectUrl) {
                // إظهار زر الانتقال أو التحويل التلقائي مباشرة
                document.getElementById('loading-section').style.display = 'none';
                const actionBox = document.getElementById('success-action-section');
                actionBox.style.display = 'block';
                document.getElementById('contrib-link').href = result.data.redirectUrl;
                
                // تحويل تلقائي بعد ثانية إذا رغبت
                setTimeout(() => {
                  window.location.href = result.data.redirectUrl;
                }, 1500);
              } 
              // إذا كان كارت إنترنت عادي وتم توليده
              else if (result.data.code) {
                window.location.href = "/success?merchant_order_id=" + txId;
              }
            }
          } catch (e) {
            console.error("فحص الحالة...", e);
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
