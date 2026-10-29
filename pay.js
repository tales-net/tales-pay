const axios = require('axios');
const path = require('path');
const { getCheckoutPage } = require('./checkout');
const { BRANCH_NAMES } = require("./branches");

// ==========================================
// إعدادات وبوابات Paymob (المحافظ وفاليو)
// ==========================================

async function getAuthToken() {
  try {
    const response = await axios.post("https://accept.paymob.com/api/auth/tokens", {
      api_key: process.env.PAYMOB_API_KEY
    });
    return response.data.token;
  } catch (err) {
    console.error("❌ Paymob Auth Error Details:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error("فشل الحصول على توكن المصادقة من Paymob");
  }
}

async function createOrder(authToken, amountCents, branchData = {}) {
  try {
    const branchKey = branchData.branch || 'main';
    const branchName = branchData.branch_name || 'حكايات نت رئيسي';

    const payload = {
      auth_token: authToken,
      delivery_needed: "false",
      amount_cents: Math.round(Number(amountCents)),
      currency: "EGP",
      merchant_order_id: `TALES-${branchKey.toUpperCase()}-${Date.now()}`,
      items: [],
      merchant_extra: {
        branch: branchKey,
        branch_name: branchName
      }
    };

    const response = await axios.post("https://accept.paymob.com/api/ecommerce/orders", payload);
    return response.data.id;
  } catch (err) {
    console.error("❌ Paymob Create Order Error Details:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error("فشل إنشاء الطلب في Paymob");
  }
}

async function getPaymentKey(authToken, orderId, amountCents, integrationId, phone = "01000000000", branchData = {}) {
  try {
    let sanitizedPhone = String(phone).replace(/\D/g, "");
    if (!sanitizedPhone || sanitizedPhone.length < 11) {
      sanitizedPhone = "01000000000";
    }

    const branchKey = branchData.branch || 'main';
    const branchName = branchData.branchName || 'حكايات نت رئيسي';

    const payload = {
      auth_token: authToken,
      amount_cents: Math.round(Number(amountCents)),
      expiration: 3600,
      order_id: Number(orderId),
      billing_data: {
        apartment: "NA",
        email: "customer@tales-net.com",
        floor: "NA",
        first_name: "Tales",
        street: branchName,
        building: "NA",
        phone_number: sanitizedPhone,
        shipping_method: branchKey,
        postal_code: "NA",
        city: "Cairo",
        country: "EG",
        last_name: "Customer",
        state: "NA"
      },
      currency: "EGP",
      integration_id: Number(integrationId),
      lock_order_when_paid: "true",
      extra: {
        branch: branchKey,
        branch_name: branchName
      }
    };

    const response = await axios.post("https://accept.paymob.com/api/acceptance/payment_keys", payload);
    return response.data.token;
  } catch (err) {
    console.error("❌ Paymob Payment Key Error Details:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error("فشل توليد مفتاح الدفع من Paymob");
  }
}

async function createPaymobPayment(phone, amount, method = 'wallet', branch = '', req = null, res = null) {
  try {
    const amountCents = Math.round(parseFloat(amount) * 100).toString();
    const cleanMethod = (method || 'wallet').toLowerCase();

    let rawBranch = String(branch || '').toLowerCase().trim();
    if (!rawBranch && req) {
      rawBranch = String(req.body?.branch || req.query?.branch || '').toLowerCase().trim();
    }

    if (!rawBranch || !BRANCH_NAMES[rawBranch]) {
      if (res) {
        if (req?.headers?.['content-type']?.includes('application/json')) {
          return res.status(400).json({ success: false, error: "يجب اختيار فرع صحيح للشبكة قبل إتمام الدفع." });
        }
        return res.status(400).sendFile(path.join(__dirname, 'public', 'warning.html'));
      }
      throw new Error(`يجب اختيار فرع صحيح للشبكة. الفرع المحدد غير مدعوم: [${rawBranch}]`);
    }

    const selectedBranch = rawBranch;
    const branchDisplayName = BRANCH_NAMES[selectedBranch];

    let integrationId;
    switch (cleanMethod) {
      case 'valu':
        integrationId = process.env.VALU_INTEGRATION_ID;
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
    const orderId = await createOrder(token, amountCents, { branch: selectedBranch, branch_name: branchDisplayName });
    const paymentKey = await getPaymentKey(token, orderId, amountCents, integrationId, phone || '01000000000', { branch: selectedBranch, branchName: branchDisplayName });

    if (cleanMethod === 'wallet') {
      const walletRes = await axios.post('https://accept.paymob.com/api/acceptance/payments/pay', {
        source: { identifier: phone, subtype: "WALLET" },
        payment_token: paymentKey
      });

      const redirectUrl = walletRes.data.iframe_redirection_url || walletRes.data.redirection_url;
      if (!redirectUrl) throw new Error("لم يتم استرجاع رابط إعادة توجيه المحفظة من Paymob");
      return { type: 'redirect', url: redirectUrl };
    } else {
      const iframeId = process.env.PAYMOB_IFRAME_ID;
      if (!iframeId) throw new Error("Missing PAYMOB_IFRAME_ID in environment variables");

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

// ==========================================
// إعدادات وبوابات XPay الحقيقية (Checkout Sessions)
// ==========================================

const XPAY_API_KEY = process.env.XPAY_API_KEY;
// الاعتماد على الرابط المعتمد لمنصة XPay (أو الـ Production/Sandbox الأساسي)
const XPAY_BASE_URL = "https://api.xpay.app/v1"; 

/**
 * إنشاء جلسة دفع حقيقية عبر XPay باستخدام Checkout Sessions API
 */
async function createXPayPayment(phone, amount, branchKey, customTxId = null) {
  try {
    const transactionId = customTxId || "TX_" + Date.now();
    console.log(`💳 [XPay Checkout] بدء إنترنت الدفع الحقيقي | المعاملة: ${transactionId} | المبلغ: ${amount}ج | الفرع: ${branchKey}`);

    const hotspotUrl = process.env.NETWORK_HOTSPOT_URL || "https://tales-pay.onrender.com";
    const successRedirectionUrl = `${hotspotUrl}/success?id=${transactionId}&branch=${branchKey}&amount=${amount}`;
    const failureRedirectionUrl = `${hotspotUrl}/fail?error=` + encodeURIComponent("فشلت عملية الدفع بالبطاقة البنكية");

    let paymentUrl = "";

    try {
      // الهيكل المتوافق مع Checkout Sessions في XPay الحديثة
      const response = await axios.post(`${XPAY_BASE_URL}/checkout-sessions`, {
        amount_total: Math.round(Number(amount) * 100), // بالميلس/قروش أو حسب العملة المعتمدة
        currency: "EGP",
        merchant_order_id: transactionId,
        success_url: successRedirectionUrl,
        cancel_url: failureRedirectionUrl,
        customer: {
          phone_number: phone || "01000000000",
          first_name: "Tales",
          last_name: "Customer",
          email: "customer@tales-net.com"
        }
      }, {
        headers: {
          "Authorization": `Bearer ${XPAY_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      });

      paymentUrl = response.data?.data?.url || response.data?.url || response.data?.data?.checkout_url;
    } catch (apiErr) {
      console.warn("⚠️ [XPay API Warning] محاولة الاتصال بـ Checkout Sessions فشلت، استخدام الرابط الاحتياطي:", apiErr.response?.data || apiErr.message);
    }

    // إذا لم يتحصل على رابط مباشر، يتم التوجيه لرابط الـ Payment Links المخصص أو لوحة الفوترة
    if (!paymentUrl) {
      paymentUrl = `https://app.xpay.app/pay?amount=${amount}&order_id=${transactionId}&phone=${phone || ''}`;
    }

    console.log(`🔗 [XPay Real] رابط التوجيه النهائي للعميل: ${paymentUrl}`);

    if (typeof getCheckoutPage === 'function') {
      const htmlPage = getCheckoutPage({ url: paymentUrl });
      return { type: 'html', content: htmlPage };
    }

    return {
      type: "redirect",
      url: paymentUrl
    };

  } catch (err) {
    console.error("❌ [XPay Real Payment Error]:", err.response?.data || err.message);
    throw new Error(err.response?.data?.message || err.message);
  }
}

// ==========================================
// دالة المعالجة الموحدة للبوابات
// ==========================================

async function processPayment(phone, amount, method = 'wallet', branch = '', req = null, res = null, transactionId = null) {
  const cleanMethod = (method || '').toLowerCase();

  // توجيه طلبات البطاقة البنكية إلى XPay الحقيقي وتمرير رقم المعاملة الثابت
  if (cleanMethod === 'card' || cleanMethod === 'xpay' || cleanMethod === 'xpay_card' || cleanMethod === 'visa') {
    return await createXPayPayment(phone, amount, branch || 'main', transactionId);
  }

  // باقي الوسائل (مثل المحافظ وفاليو) تعمل عبر Paymob
  return await createPaymobPayment(phone, amount, cleanMethod, branch, req, res);
}

module.exports = { 
  createPaymobPayment,
  createXPayPayment,
  processPayment,
  getAuthToken,
  createOrder,
  getPaymentKey,
  BRANCH_NAMES
};
