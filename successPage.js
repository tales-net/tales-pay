<script>
          // تثبيت رقم العملية حصرياً من القيمة الحقيقية المُمررة من السيرفر
          const serverTxId = "${transactionId}";
          const urlParams = new URLSearchParams(window.location.search);
          const urlTxId = urlParams.get('id') || urlParams.get('order') || urlParams.get('transaction_id') || urlParams.get('merchant_order_id');
          
          // الاعتماد على البارامتر من الرابط إذا وجد، وإلا استخدام المعرف الثابت من السيرفر لضمان عدم الاختلاف
          const txId = (urlTxId && urlTxId !== "غير محدد" && !urlTxId.includes("TX_")) ? urlTxId : serverTxId;

          // تحديث العرض في الصفحة فوراً
          if (txId && txId !== "غير محدد") {
            const displayEl = document.getElementById('txIdDisplay');
            if (displayEl) displayEl.innerText = txId;
          }

          let attempts = 0;
          const maxAttempts = 90; 

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
                setTimeout(pollVoucher, 2000); 
              } else {
                window.location.href = '/fail?error=' + encodeURIComponent("⚠️ أنتهت مهلة الانتظار ولم يتم الدفع بنجاح. رقم المعاملة: " + txId);
              }
            } catch (e) {
              if (attempts < maxAttempts) {
                setTimeout(pollVoucher, 2500);
              } else {
                window.location.href = '/fail?error=' + encodeURIComponent("خطأ في الاتصال بالسيرفر للمعاملة: " + txId);
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
