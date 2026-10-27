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
 * 4. 💳 إنشاء جلسة دفع البطاقة البنكية (Visa / Mastercard) عبر XPay
 */
async function createXpayCardPayment(amount, phone = "01000000000", branchData = {}) {
  try {
    const apiKey = process.env.XPAY_API_KEY;
    if (!apiKey) {
      throw new Error("مفتاح XPAY_API_KEY غير موجود في متغيرات البيئة (Environment Variables)");
    }

    let sanitizedPhone = String(phone).replace(/\D/g, "");
    if (!sanitizedPhone || sanitizedPhone.length < 11) {
      sanitizedPhone = "01000000000";
    }
    const formattedPhone = sanitizedPhone.startsWith("+") ? sanitizedPhone : `+2${sanitizedPhone}`;

    const branchKey = branchData.branch || 'main';
    const branchName = branchData.branch_name || 'حكايات نت رئيسي';
    const numAmount = parseFloat(amount);
    const amountCents = Math.round(numAmount * 100);
    const baseUrl = process.env.NETWORK_HOTSPOT_URL || "https://tales-pay.onrender.com";
    const customOrderId = `XPAY_${branchKey.toUpperCase()}_${Date.now()}`;

    // المحاولة الأولى: استخدام نظام Checkout Sessions الحديث لـ XPay (الذي يتوافق مع الـ Webhook الخاص بك)
    try {
      const sessionPayload = {
        success_url: `${baseUrl}/success?id={CHECKOUT_SESSION_ID}&branch=${branchKey}`,
        cancel_url: `${baseUrl}/fail?branch=${branchKey}&amount=${numAmount}&phone=${sanitizedPhone}`,
        currency: "EGP",
        payment_method_types: ["card"],
        customer_email: "customer@tales-net.com",
        customer_phone: formattedPhone,
        metadata: {
          branch: branchKey,
          branch_name: branchName,
          phone: sanitizedPhone,
          amount: String(numAmount),
          custom_order_id: customOrderId
        },
        line_items: [
          {
            price_data: {
              currency: "EGP",
              product_data: {
                name: `باقة إنترنت - ${branchName}`
              },
              unit_amount: amountCents
            },
            quantity: 1
          }
        ]
      };

      const res = await axios.post("https://app.xpay.app/api/v1/checkout/sessions", sessionPayload, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "x-api-key": apiKey,
          "Content-Type": "application/json"
        }
      });

      const redirectUrl = res.data?.url || res.data?.data?.url || res.data?.checkout_url;
      if (redirectUrl) {
        console.log(`✅ [XPay Checkout Session] تم إنشاء رابط الدفع بنجاح للفرع (${branchKey})`);
        return { type: 'redirect', url: redirectUrl };
      }
    } catch (sessionErr) {
      // في حال كان الحساب يستخدم نظام XPay Community API التقليدي
      const communityId = process.env.XPAY_COMMUNITY_ID;
      if (!communityId) {
        throw sessionErr;
      }

      console.log("🔄 جاري استخدام XPay Community API البديل...");
      const legacyPayload = {
        community_id: communityId,
        amount: numAmount,
        currency: "EGP",
        selected_payment_method: "card",
        user: {
          name: "Tales Customer",
          email: "customer@tales-net.com",
          mobile: formattedPhone
        },
        custom_fields: [
          { field_label: "branch", field_value: branchKey },
          { field_label: "branch_name", field_value: branchName },
          { field_label: "phone", field_value: sanitizedPhone }
        ]
      };

      const legacyRes = await axios.post("https://community.xpay.app/api/v1/payments/pay/variable-amount", legacyPayload, {
        headers: {
          "x-api-key": apiKey,
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      });

      const legacyUrl = legacyRes.data?.data?.iframe_url || legacyRes.data?.data?.payment_url || legacyRes.data?.iframe_url;
      if (legacyUrl) {
        return { type: 'redirect', url: legacyUrl };
      }
    }

    throw new Error("لم يتم استرجاع رابط إعادة التوجيه للدفع من XPay");
  } catch (err) {
    console.error("❌ XPay Card Payment Error Details:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error(`فشل إنشاء معاملة البطاقة عبر XPay: ${err.response?.data?.message || err.message}`);
  }
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
