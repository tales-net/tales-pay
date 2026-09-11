const { BRANCH_NAMES } = require('./branches');

function generateSuccessPageHtml(transactionId, networkUrl, queryBranch) {
  let inferredBranch = "waitPage";
  const upperTx = (transactionId || "").toUpperCase();
  if (upperTx.includes("BRANCH2") || upperTx.includes("FR2")) inferredBranch = "branch2";
  else if (upperTx.includes("BRANCH3") || upperTx.includes("FR3")) inferredBranch = "branch3";
  else if (upperTx.includes("MAIN")) inferredBranch = "main";

  const activeBranchKey = queryBranch || inferredBranch;
  const defaultBranchName = BRANCH_NAMES[activeBranchKey] || BRANCH_NAMES.waitPage;

  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="protection.js" defer></script>
        <title>تم الدفع بنجاح - حكايات</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Cairo, sans-serif; background: #f0f2f5; text-align: center; padding: 20px 10px; direction: rtl; }
          .card-container { background: white; max-width: 480px; margin: auto; padding: 25px 20px; border-radius: 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
          .success-badge { color: #27ae60; font-size: 45px; margin-bottom: 5px; }
          h1 { color: #2c3e50; font-size: 20px; margin-bottom: 15px; }
          .ticket-card { background: linear-gradient(135deg, #01338D 0%, #001f5c 100%); color: #ffffff; border-radius: 12px; padding: 20px; margin: 20px 0; box-shadow: 0 6px 18px rgba(1, 51, 141, 0.25); text-align: right; }
          .ticket-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 10px; margin-bottom: 15px; }
          .ticket-title { font-size: 16px; font-weight: bold; }
          .ticket-brand { font-size: 12px; background: rgba(255,255,255,0.2); padding: 3px 8px; border-radius: 4px; }
          .code-box { background: #ffffff; color: #01338D; text-align: center; padding: 12px; border-radius: 8px; margin: 15px 0; font-family: monospace; font-size: 24px; font-weight: bold; letter-spacing: 2px; min-height: 50px; display: flex; align-items: center; justify-content: center; }
          .info-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; color: #e0e0e0; }
          .info-row strong { color: #ffffff; }
          .btn-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 15px; }
          .btn { flex: 1; min-width: 140px; padding: 12px; border: none; border-radius: 8px; font-weight: bold; font-size: 14px; cursor: pointer; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; }
          .btn-print { background: #27ae60; color: white; }
          .btn-download { background: #01338D; color: white; }
          .btn-home { background: #e9ecef; color: #333; width: 100%; margin-top: 10px; text-decoration: none; text-align: center; padding: 12px; border-radius: 8px; font-weight: bold; display: block; }
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
              <span class="ticket-title"><i class="fa fa-wifi"></i> كارت إنترنت - <span id="bName">${defaultBranchName}</span></span>
              <span class="ticket-brand">Hikayat Net</span>
            </div>
            <div class="info-row">
              <span>اسم الباقة:</span>
              <strong id="pkgName">جاري التحميل...</strong>
            </div>
            <div class="code-box" id="codeContainer">
              <div class="spinner"></div>
              <span style="font-size: 14px; font-weight: normal;">جاري إصدار الكارت من السيرفر...</span>
            </div>
            <div class="info-row">
              <span>رقم العملية:</span>
              <strong>${transactionId || "غير محدد"}</strong>
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
          let attempts = 0;
          const maxAttempts = 90; // تم التعديل إلى 90 محاولة × ثانيتين = 180 ثانية (3 دقائق كاملة)

          async function pollVoucher() {
            if (!txId || txId === "غير محدد") {
              window.location.href = '/fail?error=' + encodeURIComponent("لم يتم العثور على رقم العملية المطلوب.");
              return;
            }
            try {
              attempts++;
              const res = await fetch('/api/check-voucher/' + encodeURIComponent(txId));
              const data = await res.json();
              
              if (data.success && data.data) {
                if (data.data.isContribution) {
                  window.location.href = '/contribution-success?amount=' + data.data.amount + '&tx=' + encodeURIComponent(txId);
                  return;
                }

                if (data.data.code) {
                  document.getElementById('codeContainer').innerText = data.data.code;
                  document.getElementById('pkgName').innerText = data.data.packageName || "باقة إنترنت شبكة حكايات";
                  if (data.data.branchName) {
                    document.getElementById('bName').innerText = data.data.branchName;
                  }
                  return;
                }
              }

              if (attempts < maxAttempts) {
                setTimeout(pollVoucher, 2000); // الفحص كل ثانيتين
              } else {
                // إعادة التوجيه إلى صفحة الفشل بعد انقضاء الـ 3 دقائق كاملة
                const errorMsg = encodeURIComponent("⚠️ انتهت مهلة الانتظار ولم يتم الدفع بنجاح. تواصل مع الدعم أذا تم الدفع برقم المعاملة: " + txId);
                window.location.href = '/fail?error=' + errorMsg;
              }
            } catch (e) {
              if (attempts < maxAttempts) {
                setTimeout(pollVoucher, 2500);
              } else {
                const errorMsg = encodeURIComponent("خطأ في الاتصال بالسيرفر أثناء جلب الكارت للمعاملة: " + txId);
                window.location.href = '/fail?error=' + errorMsg;
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
        <script src="/chat-widget.js" defer></script>
      </body>
    </html>
  `;
}

module.exports = { generateSuccessPageHtml };
