/**
 * توليد صفحة الانتظار وتأكيد الدفع (بدون أزرار داخلية)
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

          /* النافذة المنبثقة لإصدار الكارت عند توفره */
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
          
          <h1>جاري تقديم طلب الدفع...</h1>
          <p class="subtitle">انتظر قليلاً، وسيظهر الكارت فور التأكيد بالنافذة دون الحاجة للخروج.</p>

          <div class="highlight-action">
            <i class="fa fa-bell" style="font-size: 16px;"></i>
            <span>واقبل طلب الدفع فور وصول الإشعار على هاتفك</span>
          </div>

          <div class="info-box">
            <div class="info-row">
              <span>حالة الطلب:</span>
              <span class="status-badge"><span class="status-dot"></span> قيد المراجعة والموافقة</span>
            </div>
            <div class="info-row" style="margin-top: 10px;">
              <span>رقم العملية:</span>
              <strong>${transactionId}</strong>
            </div>
          </div>
        </div>

        <!-- النافذة المنبثقة لإصدار الكارت -->
        <div class="modal-overlay" id="voucherModal">
          <div class="modal-box">
            <div style="font-size: 45px; color: #16a34a; margin-bottom: 8px;"><i class="fa fa-check-circle"></i></div>
            <h2 style="font-size: 20px; color: #1e293b;">تم تأكيد الدفع وإصدار الكارت!</h2>
            <p style="font-size: 13px; color: #64748b; margin-top: 5px;">استخدم الكود التالي للتصفح المباشر:</p>
            
            <div class="voucher-code" id="modalCardCode">------</div>
            
            <button class="btn-copy" onclick="copyCardCode()"><i class="fa fa-clone"></i> نسخ كود الكارت</button>
            <a href="${networkUrl}" style="display: block; margin-top: 14px; color: #64748b; text-decoration: none; font-size: 13px; font-weight: 600;">التوجه للتصفح الآن <i class="fa fa-arrow-left"></i></a>
          </div>
        </div>

        <script>
          const txId = "${transactionId}";
          let attempts = 0;

          async function checkVoucherStatus() {
            if (!txId || txId === "غير محدد") return;
            try {
              attempts++;
              const res = await fetch('/api/check-voucher/' + encodeURIComponent(txId));
              const data = await res.json();
              
              if (data.success && data.data) {
                const cardAmount = parseFloat(data.data.amount || 0);

                if (cardAmount > 100) {
                  window.location.href = '/contribution-success?amount=' + cardAmount + '&tx=' + encodeURIComponent(txId);
                  return;
                }

                document.getElementById('modalCardCode').innerText = data.data.code;
                document.getElementById('voucherModal').style.display = 'flex';
              } else {
                if (attempts < 80) setTimeout(checkVoucherStatus, 3000);
              }
            } catch (e) {
              if (attempts < 80) setTimeout(checkVoucherStatus, 4000);
            }
          }

          checkVoucherStatus();

          function copyCardCode() {
            const code = document.getElementById('modalCardCode').innerText;
            navigator.clipboard.writeText(code);
            alert("تم نسخ كود الكارت بنجاح!");
          }
        </script>
        <script src="/chat-widget.js"></script>
      </body>
    </html>
  `;
}

module.exports = { generateWaitPageHtml };
