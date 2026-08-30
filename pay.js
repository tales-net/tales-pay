const axios = require('axios');
const { getCheckoutPage } = require('./checkout');
const { getAuthToken, createOrder, getPaymentKey } = require('./paymob');

const BRANCH_NAMES = {
  main: 'حكايات نت رئيسي',
  branch2: 'حكايات نت فرع ثاني',
  branch3: 'حكايات نت فرع ثالث'
};

async function createPaymobPayment(phone, amount, method = 'wallet', branch = 'branch2') {
  try {
    const amountCents = Math.round(parseFloat(amount) * 100).toString();
    const cleanMethod = (method || 'wallet').toLowerCase();
    
    // تصحيح الفرع: إذا لم يُرسل أو لم يكن موجوداً، نعتمد الفرع الثاني افتراضياً بدلاً من الرئيسي لعدم التعارض
    const selectedBranch = (branch && BRANCH_NAMES[branch]) ? branch : 'branch2';
    const branchDisplayName = BRANCH_NAMES[selectedBranch];

    console.log(`💳 [Pay.js] إنشاء معاملة | الفرع: ${branchDisplayName} (${selectedBranch}) | المبلغ: ${amount} | الوسيلة: ${cleanMethod}`);

    let integrationId;
    switch (cleanMethod) {
      case 'card':
        integrationId = process.env.CARD_INTEGRATION_ID;
        break;
      case 'wallet':
      default:
        integrationId = process.env.WALLET_INTEGRATION_ID;
        break;
    }

    if (!integrationId) {
      throw new Error(`Missing Integration ID for method: ${cleanMethod}`);
    }

    const token = await getAuthToken();
    
    // تمرير بيانات الفرع بوضوح في الـ Extra Data لضمان وصولها للـ Webhook
    const orderId = await createOrder(token, amountCents, {
      branch: selectedBranch,
      branch_name: branchDisplayName
    });

    const paymentKey = await getPaymentKey(
      token, 
      orderId, 
      amountCents, 
      integrationId, 
      phone || '01000000000',
      { branch: selectedBranch, branchName: branchDisplayName }
    );

    if (cleanMethod === 'wallet') {
      const walletRes = await axios.post('https://accept.paymob.com/api/acceptance/payments/pay', {
        source: {
          identifier: phone,
          subtype: "WALLET"
        },
        payment_token: paymentKey
      });

      const redirectUrl = walletRes.data.iframe_redirection_url || walletRes.data.redirection_url;
      if (!redirectUrl) {
        throw new Error("لم يتم استرجاع رابط إعادة توجيه المحفظة من Paymob");
      }
      return { type: 'redirect', url: redirectUrl };
    } else {
      const iframeId = cleanMethod === 'card' 
        ? (process.env.CARD_IFRAME_ID || process.env.PAYMOB_IFRAME_ID) 
        : process.env.PAYMOB_IFRAME_ID;

      if (!iframeId) {
        throw new Error("Missing PAYMOB_IFRAME_ID in environment variables");
      }

      if (typeof getCheckoutPage === 'function') {
        const htmlPage = getCheckoutPage(paymentKey, iframeId);
        return { type: 'html', content: htmlPage };
      }
      
      const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`;
      return { type: 'redirect', url: iframeUrl };
    }

  } catch (err) {
    console.error('❌ Paymob Payment Error:', err.response?.data || err.message);
    throw new Error(`Payment processing failed: ${err.message}`);
  }
}

module.exports = { 
  createPaymobPayment, 
  processPayment: createPaymobPayment,
  BRANCH_NAMES
};
