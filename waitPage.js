/**
 * توليد صفحة الانتظار وتأكيد الدفع بالتصميم الجديد الآمن والاحترافي
 * @param {string} transactionId - رقم المعاملة أو الطلب
 * @param {string} networkUrl - رابط التوجيه لشبكة الميكروتيك
 * @returns {string} HTML Code
 */
function generateWaitPageHtml(transactionId, networkUrl) {
  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="protection.js" defer></script>
        <title>تم الدفع بنجاح - شبكة حكايات</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Tahoma, Cairo, sans-serif; background: #f0f2f5; text-align: center; padding: 20px 10px; direction: rtl; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
          .card-container { background: white; max-width: 480px; width: 100%; margin: auto; padding: 25px 20px; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
          .success-badge { color: #27ae60; font-size: 45px; margin-bottom: 5px; }
          h1 { color: #2c3e50; font-size: 20px; margin-bottom: 15px; }
          
          /* تصميم كارت التذكرة الاحترافي */
          .ticket-card { background: linear-gradient(135deg, #01338D 0%, #001f5c 100%); color: #ffffff; border-radius: 12px; padding: 20px; margin: 20px 0; box-shadow: 0 6px 18px rgba(1, 51, 141, 0.25); text-align: right; }
          .ticket-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 10px; margin-bottom: 15px; }
          .ticket-title { font-size: 16px; font-weight: bold; }
          .ticket-brand { font-size: 12px; background: rgba(255,255,255,0.2); padding: 3px 8px; border-radius: 4px; }
          
          .code-box { background: #ffffff; color: #01338D; text-align: center; padding: 12px; border-radius: 8px; margin: 15px 0; font-family: monospace; font-size: 24px; font-weight: bold; letter-spacing: 2px; min-height: 50px; display: flex; align-items: center; justify-content: center; }
          .info-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; color: #e0e0e0; }
          .info-row strong { color: #ffffff; }
          
          .btn-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 15px; }
          .btn { flex: 1; min-width: 140px; padding: 12px; border: none; border-radius: 8px; font-weight: bold; font-size: 14px; cursor: pointer; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s; }
          .btn-print { background: #27ae60; color: white; }
          .btn-print:hover { background: #219653; }
          .btn-download { background: #01338D; color: white; }
          .btn-download:hover { background: #002266; }
          .btn-home { background: #e9ecef; color: #333; width: 100%; margin-top: 10px; text-decoration: none; text-align: center; padding: 12px; border-radius: 8px; font-weight: bold; display: block; transition: 0.2s; }
          .btn-home:hover { background: #dde2e6; }
          
          .spinner { border: 4px solid rgba(1, 51, 141, 0.2); border-radius: 50%; border-top: 4px solid #01338D; width: 26px; height: 26px; animation: spin 1s linear infinite; margin-left: 10px; display: inline-block; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="card-container">
          <div class="success-badge"><i class="fa fa-check-circle"></i></div>
          <h1>تمت عملية الدفع بنجاح</h1>
          
          <div class="ticket-card" id="printableCard">
            <div class="ticket-header">
              <span class="ticket-title"><i class="fa fa-wifi"></i> كارت إنترنت - <span id="bName">شبكة حكايات</span></span>
              <span class="ticket-brand">Hikayat Net</span>
            </div>
            
            <div class="info-row">
              <span>اسم الباقة:</span>
              <strong id="pkgName">جاري التحميل...</strong>
            </div>
            
            <!-- صندوق الكود الذي يحدث تلقائياً بلحظتها -->
            <div class="code-box" id="codeContainer">
              <div class="spinner"></div>
              <span style="font-size: 14px; font-weight: normal; color: #01338D;">جاري إصدار وتفعيل الكارت من السيرفر...</span>
            </div>
            
            <div class="info-row">
              <span>رقم العملية:</span>
              <strong id="txIdDisplay">${transactionId || "غير محدد"}</strong>
            </div>
            <div class="info-row">
              <span>حالة الدفع:</span>
              <strong style="color: #2ec771;"><i class="fa fa-shield"></i> مؤكد ومفعل آلياً</strong>
            </div>
          </div>

          <div class="btn-actions">
            <button onclick="window.print()" class="btn btn-print"><i class="fa fa-print"></i> طباعة / حفظ PDF</button>
            <button onclick="downloadHTML()" class="btn btn-download"><i class="fa fa-download"></i> تنزيل الكارت</button>
          </div>
          
          <a href="${networkUrl}" class="btn-home"><i class="fa fa-globe"></i> التوجه للتصفح الآن</a>
        </div>

        <script>
          const urlParams = new URLSearchParams(window.location.search);
          const txId = urlParams.get('id') || urlParams.get('order') || urlParams.get('transaction_id') || urlParams.get('merchant_order_id') || "${transactionId}";
          
          if(txId && txId !== "غير محدد") {
            document.getElementById('txIdDisplay').innerText = txId;
          }

          let attempts = 0;
          const maxAttempts = 40; // عدد محاولات الفحص الدوري

          async function pollVoucher() {
            if (!txId || txId === "غير محدد") {
              document.getElementById('codeContainer').innerHTML = "<span style='color:#e74c3c; font-size:14px;'>لم يتم العثور على رقم المعاملة</span>";
              document.getElementById('pkgName').innerText = "غير معروف";
              return;
            }
            
            try {
              attempts++;
              const res = await fetch('/api/check-voucher/' + encodeURIComponent(txId));
              const data = await res.json();
              
              if (data.success && data.data) {
                const cardAmount = parseFloat(data.data.amount || 0);

                // التوجيه السريع لصفحة المساهمة الكبرى إذا كان المبلغ كبير أو مساهمة
                if (cardAmount > 100 || data.data.isContribution) {
                  window.location.href = '/contribution-success?amount=' + cardAmount + '&tx=' + encodeURIComponent(txId);
                  return;
                }

                // عرض الكارت بالتصميم المطلوب داخل الصندوق
                document.getElementById('codeContainer').innerText = data.data.code;
                document.getElementById('pkgName').innerText = data.data.packageName || "باقة إنترنت شبكة حكايات";
                if (data.data.branchName) {
                  document.getElementById('bName').innerText = data.data.branchName;
                }
                return; // إيقاف التكرار عند النجاح
              } else {
                if (attempts < maxAttempts) {
                  setTimeout(pollVoucher, 2500); // فحص كل 2.5 ثانية (محاكاة للبث المباشر)
                } else {
                  document.getElementById('codeContainer').innerHTML = "<span style='color:#e74c3c; font-size:12px;'>⚠️ تعذر جلب الكارت تلقائياً. تواصل مع الدعم برقم المعاملة: " + txId + "</span>";
                  document.getElementById('pkgName').innerText = "انتهت مهلة الانتظار";
                }
              }
            } catch (e) {
              if (attempts < maxAttempts) {
                setTimeout(pollVoucher, 3000);
              } else {
                document.getElementById('codeContainer').innerHTML = "<span style='color:#e74c3c; font-size:12px;'>خطأ في الاتصال بالسيرفر</span>";
              }
            }
          }

          pollVoucher();

          function downloadHTML() {
            const cardElement = document.getElementById('printableCard').outerHTML;
            const blob = new Blob(['<html><head><meta charset="utf-8"><title>كارت شبكة حكايات</title></head><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f0f2f5;font-family:sans-serif;">' + cardElement + '</body></html>'], { type: 'text/html' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = "Hikayat_Card_" + txId + ".html";
            a.click();
          }
        </script>
        <script src="/chat-widget.js"></script>
      </body>
    </html>
  `;
}

module.exports = { generateWaitPageHtml };
