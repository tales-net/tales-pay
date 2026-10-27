const axios = require('axios');
const path = require('path');
const { getCheckoutPage } = require('./checkout');
const { BRANCH_NAMES } = require("./branches");

/**
 * 1. المصادقة والحصول على Authentication Token من Paymob (للمحافظ وفاليو)
 */
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

/**
 * 2. إنشاء طلب دفع (Order Registration) في Paymob مع ربط بيانات الفرع
 */
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

/**
 * 3. توليد مفتاح الدفع (Payment Key Request) في Paymob مع تضمين الفرع
 */
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

/**
 * استخراج رابط الدفع من استجابة XPay بمختلف أشكالها
 */
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

/**
 * 4. 💳 إنشاء جلسة دفع البطاقة البنكية (Visa / Mastercard) عبر XPay باستخدام المفتاح السري القياسي (sk_live_...)
 */
async function createXpayCardPayment(amount, phone = "01000000000", branchData = {}) {
  // استخدام المفتاح السري sk_live_ من البيئة أو القيمة المباشرة
  const secretKey = process.env.XPAY_SECRET_KEY || process.env.XPAY_API_KEY || "sk_live";

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

  // ترويسة نقية بالمفتاح السري فقط كما تشترط واجهة XPay القياسية
  const headers = {
    "Authorization": `Bearer ${secretKey}`,
    "Content-Type": "application/json"
  };

  const endpoints = [
    "https://app.xpay.app/api/v1/checkout/sessions",
    "https://app.xpay.app/v1/checkout/sessions",
    "https://api.xpay.app/v1/checkout/sessions"
  ];

  let lastError = null;

  // المرحلة 1: تجربة إنشاء الجلسة مباشرة بصيغتي snake_case و camelCase
  for (const endpoint of endpoints) {
    // 1.A: صيغة Stripe/XPay القياسية (snake_case)
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
      console.warn(`⚠️ [XPay Direct snake_case - ${endpoint}]:`, JSON.stringify(lastError));
    }

    // 1.B: صيغة camelCase
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
      console.warn(`⚠️ [XPay Direct camelCase - ${endpoint}]:`, JSON.stringify(lastError));
    }
  }

  // المرحلة 2: في حال كانت XPay تشترط إنشاء المنتج والسعر (Product & Price) أولاً قبل الجلسة
  const baseApiList = [
    "https://app.xpay.app/api/v1",
    "https://app.xpay.app/v1"
  ];

  for (const baseApi of baseApiList) {
    try {
      // أ) إنشاء المنتج
      const prodRes = await axios.post(`${baseApi}/products`, {
        name: `باقة إنترنت ${numAmount} جنيه - ${branchName}`
      }, { headers });
      const productId = prodRes.data?.id || prodRes.data?.data?.id;

      if (productId) {
        // ب) إنشاء السعر المرتبط بالمنتج
        let priceId = null;
        try {
          const priceRes = await axios.post(`${baseApi}/prices`, {
            product: productId,
            unit_amount: amountCents,
            currency: "egp"
          }, { headers });
          priceId = priceRes.data?.id || priceRes.data?.data?.id;
        } catch (pErr) {
          const priceResCamel = await axios.post(`${baseApi}/prices`, {
            productId: productId,
            unitAmount: amountCents,
            currency: "EGP"
          }, { headers });
          priceId = priceResCamel.data?.id || priceResCamel.data?.data?.id;
        }

        // ج) إنشاء جلسة الدفع باستخدام معرف السعر (priceId)
        if (priceId) {
          try {
            const sessionRes = await axios.post(`${baseApi}/checkout/sessions`, {
              mode: "payment",
              success_url: successUrl,
              cancel_url: cancelUrl,
              line_items: [{ price: priceId, quantity: 1 }],
              metadata: metadata
            }, { headers });
            const url = extractXpayUrl(sessionRes.data);
            if (url) return { type: 'redirect', url };
          } catch (sErr) {
            const sessionResCamel = await axios.post(`${baseApi}/checkout/sessions`, {
              mode: "payment",
              successUrl: successUrl,
              cancelUrl: cancelUrl,
              lineItems: [{ price: priceId, quantity: 1 }],
              metadata: metadata
            }, { headers });
            const url = extractXpayUrl(sessionResCamel.data);
            if (url) return { type: 'redirect', url };
          }
        }
      }
    } catch (stepErr) {
      console.warn(`⚠️ [XPay Product/Price Step - ${baseApi}]:`, JSON.stringify(stepErr.response?.data || stepErr.message));
    }
  }

  // استخراج رسالة الخطأ التفصيلية من XPay لعرضها بوضوح
  const errorString = typeof lastError === 'object'
    ? JSON.stringify(lastError)
    : String(lastError);

  throw new Error(`فشل إنشاء معاملة البطاقة عبر XPay: ${errorString}`);
}

/**
 * 5. الدالة الرئيسية لمعالجة الدفع وتوجيه البوابات (Card -> XPay | Wallet & Valu -> Paymob)
 */
async function createPaymobPayment(phone, amount, method = 'wallet', branch = '', req = null, res = null) {
  try {
    const amountCents = Math.round(parseFloat(amount) * 100).toString();
    const cleanMethod = (method || 'wallet').toLowerCase();
    
    let rawBranch = String(branch || '').toLowerCase().trim();

    if (!rawBranch && req) {
      rawBranch = String(req.body?.branch || req.query?.branch || '').toLowerCase().trim();
    }

    // التحقق الصارم من الفرع
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

    // ====================================================
    // 🚀 مسار البطاقة البنكية (الفيزا / الماستركارد) -> XPay
    // ====================================================
    if (cleanMethod === 'card') {
      return await createXpayCardPayment(amount, phone, {
        branch: selectedBranch,
        branch_name: branchDisplayName
      });
    }

    // ====================================================
    // 📱 مسار المحفظة الإلكترونية وفاليو -> Paymob
    // ====================================================
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

    // معالجة المحافظ الإلكترونية عبر Paymob
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
    // معالجة Valu عبر Paymob
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
