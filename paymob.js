const axios = require("axios");

const PAYMOB_API_KEY = process.env.PAYMOB_API_KEY;
const PAYMOB_INTEGRATION_ID_CARD = process.env.PAYMOB_INTEGRATION_ID_CARD;
const PAYMOB_INTEGRATION_ID_WALLET = process.env.PAYMOB_INTEGRATION_ID_WALLET;
const PAYMOB_IFRAME_ID = process.env.PAYMOB_IFRAME_ID;

/**
 * 1. المصادقة والحصول على Authentication Token من Paymob
 */
async function getAuthToken() {
  try {
    const response = await axios.post("https://accept.paymob.com/api/auth/tokens", {
      api_key: PAYMOB_API_KEY
    });
    return response.data.token;
  } catch (err) {
    console.error("❌ Paymob Auth Error:", err.response?.data || err.message);
    throw new Error("فشل الحصول على توكن المصادقة من Paymob");
  }
}

/**
 * 2. إنشاء طلب دفع (Order Registration)
 */
async function createOrder(authToken, amountCents) {
  try {
    const response = await axios.post("https://accept.paymob.com/api/ecommerce/orders", {
      auth_token: authToken,
      delivery_needed: "false",
      amount_cents: amountCents.toString(),
      currency: "EGP",
      merchant_order_id: `TALES-${Date.now()}`,
      items: []
    });
    return response.data.id;
  } catch (err) {
    console.error("❌ Paymob Create Order Error:", err.response?.data || err.message);
    throw new Error("فشل إنشاء الطلب في Paymob");
  }
}

/**
 * 3. توليد مفتاح الدفع (Payment Key Request)
 */
async function getPaymentKey(authToken, orderId, amountCents, integrationId, payload = {}) {
  try {
    // تنظيف رقم الهاتف وإعداده
    let phone = payload.phone && payload.phone !== "غير محدد" ? payload.phone : "01000000000";
    phone = phone.replace(/[^\d+]/g, '');

    const response = await axios.post("https://accept.paymob.com/api/acceptance/payment_keys", {
      auth_token: authToken,
      amount_cents: amountCents.toString(),
      expiration: 3600,
      order_id: orderId,
      billing_data: {
        apartment: "NA",
        email: "customer@talesnet.com",
        floor: "NA",
        first_name: payload.card_data?.name?.trim() || "Tales",
        street: "NA",
        building: "NA",
        phone_number: phone,
        shipping_method: "PKG",
        postal_code: "NA",
        city: payload.city || "Cairo",
        country: "EG",
        last_name: "Customer",
        state: "NA"
      },
      currency: "EGP",
      integration_id: integrationId,
      lock_order_when_paid: "true"
    });
    return response.data.token;
  } catch (err) {
    console.error("❌ Paymob Payment Key Error Details:", JSON.stringify(err.response?.data, null, 2));
    const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message;
    throw new Error(`فشل توليد مفتاح الدفع من Paymob: ${errorMsg}`);
  }
}

/**
 * 4. تنفيذ الخصم المباشر لمحافظ الهاتف (Mobile Wallet Pay)
 */
async function payWithWallet(paymentToken, walletNumber) {
  try {
    const response = await axios.post("https://accept.paymob.com/api/acceptance/payments/pay", {
      source: {
        identifier: walletNumber,
        subtype: "WALLET"
      },
      payment_token: paymentToken
    });

    const redirectUrl = response.data.iframe_redirection_url || response.data.redirect_url;
    if (!redirectUrl) {
      throw new Error("لم يتم استلام رابط إعادة التوجيه للمحفظة من Paymob");
    }

    return redirectUrl;
  } catch (err) {
    console.error("❌ Paymob Wallet Pay Error:", JSON.stringify(err.response?.data, null, 2));
    throw new Error("فشل معالجة طلب المحفظة الإلكترونية");
  }
}

/**
 * 5. الدالة الرئيسية الشاملة لإدارة عملية الدفع
 */
async function createPaymentOrder(payload) {
  if (!payload || !payload.amount) {
    throw new Error("المبلغ مطلوب لإتمام العملية");
  }

  const amountCents = Math.round(parseFloat(payload.amount) * 100);
  const isCard = payload.payment_method === "card";
  const integrationId = isCard ? PAYMOB_INTEGRATION_ID_CARD : PAYMOB_INTEGRATION_ID_WALLET;

  // تنفيذ الخطوات بالتسلسل
  const authToken = await getAuthToken();
  const orderId = await createOrder(authToken, amountCents);
  const paymentToken = await getPaymentKey(authToken, orderId, amountCents, integrationId, payload);

  // توجيه العميل حسب وسيلة الدفع
  if (isCard) {
    return {
      payment_url: `https://accept.paymob.com/api/acceptance/iframes/${PAYMOB_IFRAME_ID}?payment_token=${paymentToken}`
    };
  } else {
    const walletUrl = await payWithWallet(paymentToken, payload.phone);
    return {
      payment_url: walletUrl
    };
  }
}

module.exports = {
  getAuthToken,
  createOrder,
  getPaymentKey,
  payWithWallet,
  createPaymentOrder
};
