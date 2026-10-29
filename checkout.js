/**
 * إنشاء صفحة HTML لإتمام الدفع (تدعم Paymob عبر Iframe و XPay عبر توجيه أو iframe مخصص)
 * @param {Object|string} options - إما رابط التوجيه لـ XPay أو مفتاح الدفع لـ Paymob
 * @param {string} [iframeId] - رقم الـ Iframe الخاص بـ Paymob (إن وجد)
 * @returns {string} - كود الصفحة HTML الكامل
 */
function getCheckoutPage(options, iframeId) {
  let checkoutContentUrl = "";
  let isXPay = false;

  // التحقق مما إذا كانت الخيارات عبارة عن كائن أو رابط موجه لـ XPay
  if (typeof options === "object" && options !== null) {
    checkoutContentUrl = options.url || options.checkout_url || "";
    isXPay = true;
  } else if (typeof options === "string" && options.startsWith("http")) {
    checkoutContentUrl = options;
    isXPay = true;
  } else if (iframeId) {
    // الطريقة التقليدية لـ Paymob عبر Iframe
    checkoutContentUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${options}`;
  }

  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>إتمام الدفع - حكايات</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: #f4f7f6;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
            }
            .iframe-card {
                background: #ffffff;
                border-radius: 12px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.08);
                width: 100%;
                max-width: 500px;
                overflow: hidden;
                padding: 10px;
                box-sizing: border-box;
                text-align: center;
            }
            iframe {
                width: 100%;
                height: 650px;
                border: none;
                border-radius: 8px;
            }
            .header {
                padding: 12px 0;
                color: #01338D;
                font-size: 18px;
                font-weight: bold;
            }
            .xpay-container {
                padding: 40px 20px;
            }
            .btn-pay {
                display: inline-block;
                background: #27ae60;
                color: white;
                padding: 14px 30px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: bold;
                font-size: 16px;
                margin-top: 20px;
                box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3);
            }
            .btn-pay:hover {
                background: #219653;
            }
        </style>
    </head>
    <body>
        <div class="iframe-card">
            <div class="header">بوابة الدفع الآمنة ${isXPay ? "(XPay)" : "(Paymob)"}</div>
            
            ${isXPay ? `
                <div class="xpay-container">
                    <p style="color: #2c3e50; font-size: 16px; margin-bottom: 20px;">انقر بالأسفل للانتقال إلى صفحة الدفع الآمنة لإتمام المعاملة.</p>
                    <a href="${checkoutContentUrl}" class="btn-pay" target="_blank">إتمام الدفع الآن 💳</a>
                </div>
            ` : `
                <iframe src="${checkoutContentUrl}" allowfullscreen></iframe>
            `}
        </div>
    </body>
    </html>
  `;
}

module.exports = { getCheckoutPage };
module.exports.default = getCheckoutPage;
