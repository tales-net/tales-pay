const axios = require('axios');
const { getCheckoutPage } = require('./checkout');
const { getAuthToken, createOrder, getPaymentKey } = require('./paymob');

/**
 * إنشاء المعاملة وتجهيز رابط الدفع الخاص بـ Paymob بناءً على نوع الوسيلة
 * @param {string} phone - رقم الهاتف أو المحفظة
 * @param {string|number} amount - المبلغ بالجنيه
 * @param {string} method - وسيلة الدفع (wallet, card, valu, seven, aman)
 * @returns {Promise<{type: string, url?: string, content?: string}>}
 */
async function createPaymobPayment(phone, amount, method = 'wallet') {
  try {
    // 1. تحويل المبلغ إلى قروش (Cents)
    const amountCents = Math.round(parseFloat(amount) * 100).toString();

    // 2. تحديد Integration ID المناسب من متغيرات البيئة
    let integrationId;
    switch (method.toLowerCase()) {
      case 'card':
        integrationId = process.env.CARD_INTEGRATION_ID;
        break;
      case 'aman':
        integrationId = process.env.AMAN_INTEGRATION_ID;
        break;
      case 'valu':
        integrationId = process.env.VALU_INTEGRATION_ID;
        break;
      case 'seven':
        integrationId = process.env.SEVEN_INTEGRATION_ID;
        break;
      case 'wallet':
      default:
        integrationId = process.env.WALLET_INTEGRATION_ID;
        break;
    }

    if (!integrationId) {
      throw new Error(`Missing Integration ID for method: ${method}`);
    }

    // 3. الحصول على توكن المصادقة، رقم الطلب، ومفتاح الدفع
    const token = await getAuthToken();
    const orderId = await createOrder(token, amountCents);
    const paymentKey = await getPaymentKey(token, orderId, amountCents, integrationId, phone || '01000000000');

    // 4. معالجة وسيلة المحفظة الإلكترونية (Mobile Wallet) فقط هي التي تحتاج Redirect خارجي
    if (method.toLowerCase() === 'wallet') {
      const walletRes = await axios.post('https://accept.paymob.com/api/acceptance/payments/pay', {
        source: {
          identifier: phone,
          subtype: "WALLET"
        },
        payment_token: paymentKey
      });

      const redirectUrl = walletRes.data.iframe_redirection_url || walletRes.data.redirection_url;
      return { type: 'redirect', url: redirectUrl };
    } 
    
    // 5. معالجة البطاقات البنكية ووسائل التقسيط (Card, Valu, Seven, Aman) عبر صفحة Iframe الآمنة
    else {
      const iframeId = process.env.PAYMOB_IFRAME_ID;
      if (typeof getCheckoutPage === 'function') {
        const htmlPage = getCheckoutPage(paymentKey, iframeId);
        return { type: 'html', content: htmlPage };
      }
      
      // كود احتياطي في حال عدم توفر دالة الـ checkout
      const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`;
      return { type: 'redirect', url: iframeUrl };
    }

  } catch (err) {
    console.error('❌ Paymob Payment Integration Error:', err.response?.data || err.message);
    throw new Error(`Payment processing failed: ${err.message}`);
  }
}

module.exports = { createPaymobPayment, processPayment: createPaymobPayment };
