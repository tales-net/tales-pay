/**
 * ملف خاص بعبارات التهنئة، الشكر، والأدعية للمساهمات المالية (أكبر من 100 جنيه)
 * وتصميم صفحة الويب الاحترافية الخاصة بعرض رسالة المساهمة.
 */

const contributionBlessings = [
  "جزاكم الله خيراً وجعل هذه المساهمة الطيبة في ميزان حسناتكم، وبارك لكم في مالكم وأهليكم.",
  "تقبل الله منا ومنكم صالح الأعمال، نسأل الله أن يبارك في عطائكم ويجعله صدقة جارية ونوراً في دربكم.",
  "بارك الله في جهودكم الكريمة ودعمكم المستمر، وجعل الله التوفيق والنجاح حليفكم دائماً وأبداً.",
  "نشكر لكم مساهمتكم المباركة، نسأل الله أن يخلف عليكم خيراً وأن يرزقكم من حيث لا تحتسبون."
];

/**
 * دالة لاختيار رسالة تهنئة عشوائية أو ثابتة بشكل مميز
 */
function getRandomBlessingMessage(amount) {
  const randomIndex = Math.floor(Math.random() * contributionBlessings.length);
  return {
    title: "✨ مساهمة مباركة ودعم كريم ✨",
    message: contributionBlessings[randomIndex],
    amountText: `مبلغ المساهمة: ${amount} جنيه`,
    footerNote: "دمتم سباقين للخير، بارك الله في مالكم وأهليكم، لا تنسي الدعاء لوالدي"
  };
}

/**
 * دالة لتوليد كود HTML احترافي ومتكامل لصفحة عرض المساهمة (شبيهة بصفحة الـ Success)
 */
function generateContributionHtmlPage(amount, transactionId = "") {
  const blessingData = getRandomBlessingMessage(amount);
  
  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>مساهمة مباركة - شبكة حكايات نت</title>
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
        }
        .container {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(241, 196, 15, 0.3);
          border-radius: 20px;
          padding: 40px 30px;
          max-width: 600px;
          width: 100%;
          text-align: center;
          box-shadow: 0 15px 35px rgba(0, 0, 0, 0.5);
        }
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
        h1 {
          color: #f1c40f;
          font-size: 28px;
          margin-bottom: 15px;
          font-weight: bold;
        }
        .amount-badge {
          display: inline-block;
          background: linear-gradient(45deg, #f1c40f, #f39c12);
          color: #111;
          font-size: 22px;
          font-weight: bold;
          padding: 10px 25px;
          border-radius: 50px;
          margin: 20px 0;
          box-shadow: 0 5px 15px rgba(241, 196, 15, 0.4);
        }
        .message-box {
          background: rgba(0, 0, 0, 0.2);
          border-right: 5px solid #2ecc71;
          padding: 20px;
          border-radius: 10px;
          margin: 20px 0;
          font-size: 18px;
          line-height: 1.8;
          color: #ecf0f1;
          text-align: right;
        }
        .tx-info {
          font-size: 14px;
          color: #9fb3c8;
          margin-top: 15px;
        }
        .footer-note {
          margin-top: 25px;
          font-size: 16px;
          color: #2ecc71;
          font-weight: bold;
          border-top: 1px dashed rgba(255, 255, 255, 0.2);
          padding-top: 20px;
        }
        .btn {
          display: inline-block;
          margin-top: 25px;
          background: transparent;
          border: 2px solid #f1c40f;
          color: #f1c40f;
          padding: 10px 30px;
          border-radius: 30px;
          text-decoration: none;
          font-weight: bold;
          transition: all 0.3s ease;
        }
        .btn:hover {
          background: #f1c40f;
          color: #111;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon-box">🌟</div>
        <h1>${blessingData.title}</h1>
        
        <div class="amount-badge">
          ${blessingData.amountText}
        </div>

        <div class="message-box">
          <p>${blessingData.message}</p>
        </div>

        ${transactionId ? `<div class="tx-info">رقم العملية: #${transactionId}</div>` : ''}

        <div class="footer-note">
          ${blessingData.footerNote}
        </div>

        <div>
          <a href="https://tales-pay.onrender.com" class="btn">العودة للرئيسية</a>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = {
  contributionBlessings,
  getRandomBlessingMessage,
  generateContributionHtmlPage
};
