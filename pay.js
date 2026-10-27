const axios = require('axios');
const path = require('path');
const { getCheckoutPage } = require('./checkout');
const { BRANCH_NAMES } = require("./branches");

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

function extractXpayUrl(resData) {
  if (!resData) return null;
  return (
    resData.url ||
    resData.checkoutUrl ||
    resData.checkout_url ||
    resData.data?.url ||
    resData.data?.checkoutUrl ||
    resData.data?.checkout_url ||
    resData.session?.url ||
    null
  );
}

async function createXpayCardPayment(amount, phone = "01000000000", branchData = {}) {
  const secretKey = process.env.XPAY_SECRET_KEY || process.env.XPAY_API_KEY;

  let sanitizedPhone = String(phone).replace(/\D/g, "");
  if (!sanitizedPhone || sanitizedPhone.length < 11) {
    sanitizedPhone = "01000000000";
  }

  const branchKey = branchData.branch || 'main';
  const branchName = branchData.branch_name || 'حكايات نت رئيسي';
  const numAmount = parseFloat(amount);
  const amountCents = Math.round(numAmount * 100);
  const baseUrl = (process.env.NETWORK_HOTSPOT_URL || "https://tales-pay.onrender.com").replace(/\/$/, "");
  const customOrderId = `XPAY_${branchKey.toUpperCase()}_${Date.now()}`;

  const successUrl = `${baseUrl}/success?id={CHECKOUT_SESSION_ID}&branch=${branchKey}`;
  const cancelUrl = `${baseUrl}/fail?branch=${branchKey}&amount=${numAmount}&phone=${sanitizedPhone}`;

  const metadata = {
    branch: branchKey,
    branch_name: branchName,
    phone: sanitizedPhone,
    amount: String(numAmount),
    custom_order_id: customOrderId
  };

  const headers = {
    "Authorization": `Bearer ${secretKey}`,
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*"
  };

  const endpoints = [
    "https://app.xpay.app/api/v1/checkout/sessions",
    "https://app.xpay.app/v1/checkout/sessions",
    "https://api.xpay.app/v1/checkout/sessions"
  ];

  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const payloadSnake = {
        mode: "payment",
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: [
          {
            price_data: {
              currency: "egp",
              product_data: {
                name: `باقة إنترنت - ${branchName}`
              },
              unit_amount: amountCents
            },
            quantity: 1
          }
        ],
        metadata: metadata
      };

      const res = await axios.post(endpoint, payloadSnake, { headers });
      const url = extractXpayUrl(res.data);
      if (url) {
        console.log(`✅ [XPay Checkout] تم إنشاء جلسة الدفع بنجاح للفرع (${branchKey})`);
        return { type: 'redirect', url };
      }
    } catch (err) {
      lastError = err.response?.data || err.message;
    }

    try {
      const payloadCamel = {
        mode: "payment",
        successUrl: successUrl,
        cancelUrl: cancelUrl,
        lineItems: [
          {
            priceData: {
              currency: "EGP",
              productData: {
                name: `باقة إنترنت - ${branchName}`
              },
              unitAmount: amountCents
            },
            quantity: 1
          }
        ],
        metadata: metadata
      };

      const res = await axios.post(endpoint, payloadCamel, { headers });
      const url = extractXpayUrl(res.data);
      if (url) {
        console.log(`✅ [XPay Checkout camelCase] تم إنشاء جلسة الدفع بنجاح للفرع (${branchKey})`);
        return { type: 'redirect', url };
      }
    } catch (err) {
      lastError = err.response?.data || err.message;
    }
  }

  const errorString = typeof lastError === 'object'
    ? JSON.stringify(lastError)
    : String(lastError);

  throw new Error(`فشل إنشاء معاملة البطاقة عبر XPay: ${errorString}`);
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
      console.warn(`⚠️ [Pay.js] رفض معاملة لدفع بفرع غير صالح أو مفقود: [${rawBranch}]`);
      
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

    console.log(`💳 [Pay.js] إنشاء معاملة مؤكدة | الفرع: ${branchDisplayName} (${selectedBranch}) | المبلغ: ${amount} | الوسيلة: ${cleanMethod}`);

    if (cleanMethod === 'card') {
      return await createXpayCardPayment(amount, phone, {
        branch: selectedBranch,
        branch_name: branchDisplayName
      });
    }

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
      throw new Error(`Missing Paymob Integration ID for method: ${cleanMethod}`);
    }

    const token = await getAuthToken();
    
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
    } 
    else if (cleanMethod === 'valu') {
      const iframeId = process.env.VALU_IFRAME_ID || process.env.PAYMOB_IFRAME_ID;
      
      if (!iframeId) {
        throw new Error("Missing VALU_IFRAME_ID or PAYMOB_IFRAME_ID in environment variables");
      }

      if (typeof getCheckoutPage === 'function') {
        const htmlPage = getCheckoutPage(paymentKey, iframeId);
        return { type: 'html', content: htmlPage };
      }
      
      const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`;
      return { type: 'redirect', url: iframeUrl };
    }

  } catch (err) {
    console.error('❌ Payment Error:', err.response?.data || err.message);
    throw new Error(`Payment processing failed: ${err.message}`);
  }
}

module.exports = { 
  createPaymobPayment, 
  processPayment: createPaymobPayment,
  createXpayCardPayment,
  getAuthToken,
  createOrder,
  getPaymentKey,
  BRANCH_NAMES
};
