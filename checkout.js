/**
 * إنشاء صفحة HTML تضم الـ Iframe الخاص بـ Paymob مع تصميم متناسق
 * @param {string} paymentToken - مفتاح الدفع المستلم من Paymob
 * @param {string} iframeId - رقم الـ Iframe الخاص بالبطاقات
 * @returns {string} - كود الصفحة HTML الكامل
 */
function getCheckoutPage(paymentToken, iframeId) {
  const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentToken}`;

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
            }
            iframe {
                width: 100%;
                height: 650px;
                border: none;
                border-radius: 8px;
            }
            .header {
                text-align: center;
                padding: 10px 0;
                color: #01338D;
                font-size: 18px;
                font-weight: bold;
            }
        </style>
    </head>
    <body>
        <div class="iframe-card">
            <div class="header">بوابة الدفع الآمنة</div>
            <iframe src="${iframeUrl}" allowfullscreen></iframe>
        </div>
    </body>
    </html>
  `;
}

module.exports = { getCheckoutPage };
module.exports.default = getCheckoutPage;
