const axios = require('axios');
const { getCheckoutPage } = require('./checkout');
const { getAuthToken, createOrder, getPaymentKey } = require('./paymob');

/**
 * أسماء الفروع للطباعة والتحديد
 */
const BRANCH_NAMES = {
  main: 'حكايات نت رئيسي',
  branch2: 'حكايات نت فرع ثاني',
  branch3: 'حكايات نت فرع ثالث'
};

/**
 * إنشاء المعاملة وتجهيز رابط الدفع الخاص بـ Paymob بناءً على نوع الوسيلة والفرع المختار
 * @param {string} phone - رقم الهاتف أو المحفظة
 * @param {string|number} amount - المبلغ بالجنيه
 * @param {string} method - وسيلة الدفع (wallet, card, etc.)
 * @param {string} branch - الفرع (main, branch2, branch3)
 * @returns {Promise<{type: string, url?: string, content?: string}>}
 */
async function createPaymobPayment(phone, amount, method = 'wallet', branch = 'main') {
  try {
    // 1. تحويل المبلغ إلى قروش (Cents) وتوحيد نص وسيلة الدفع والفرع
    const amountCents = Math.round(parseFloat(amount) * 100).toString();
    const cleanMethod = (method || 'wallet').toLowerCase();
    const selectedBranch = (branch && BRANCH_NAMES[branch]) ? branch : 'main';
    const branchDisplayName = BRANCH_NAMES[selectedBranch];

    console.log(`💳 [Pay.js] البدء في إنشاء معاملة | الفرع: ${branchDisplayName} (${selectedBranch}) | المبلغ: ${amount} ج.م | الوسيلة: ${cleanMethod}`);

    // 2. تحديد Integration ID المناسب من متغيرات البيئة
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

    // 3. الحصول على توكن المصادقة، رقم الطلب، ومفتاح الدفع مع تمرير اسم الفرع
    const token = await getAuthToken();
    
    // تمرير الفرع ضمن بيانات الطلب (مهم لتتبعه في Webhook)
    const orderId = await createOrder(token, amountCents, {
      branch: selectedBranch,
      branch_name: branchDisplayName
    });

    // الحصول على مفتاح الدفع مع تضمين الفرع بداخل بيانات العميل/الطلب
    const paymentKey = await getPaymentKey(
      token, 
      orderId, 
      amountCents, 
      integrationId, 
      phone || '01000000000',
      { branch: selectedBranch, branchName: branchDisplayName }
    );

    // 4. معالجة وسيلة المحفظة الإلكترونية (Mobile Wallet)
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
    } 
    
    // 5. معالجة البطاقات البنكية ووسائل التقسيط (Card, etc.)
    else {
      // السماح بتخصيص Iframe ID خاص بالبطاقة أو استخدام الـ ID العام كبديل
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
    console.error('❌ Paymob Payment Integration Error:', err.response?.data || err.message);
    throw new Error(`Payment processing failed: ${err.message}`);
  }
}

module.exports = { 
  createPaymobPayment, 
  processPayment: createPaymobPayment,
  BRANCH_NAMES
};
