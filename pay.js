const axios = require("axios");

/**
 * 1. المصادقة والحصول على Authentication Token من Paymob
 */
async function getAuthToken() {
  try {
    const response = await axios.post("https://accept.paymob.com/api/auth/tokens", {
      api_key: process.env.PAYMOB_API_KEY
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
      amount_cents: amountCents,
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
async function getPaymentKey(authToken, orderId, amountCents, integrationId, phone = "01000000000") {
  try {
    const response = await axios.post("https://accept.paymob.com/api/acceptance/payment_keys", {
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: orderId,
      billing_data: {
        apartment: "NA",
        email: "customer@tales-net.com",
        floor: "NA",
        first_name: "Tales",
        street: "NA",
        building: "NA",
        phone_number: phone,
        shipping_method: "PKG",
        postal_code: "NA",
        city: "Cairo",
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
    console.error("❌ Paymob Payment Key Error:", err.response?.data || err.message);
    throw new Error("فشل توليد مفتاح الدفع من Paymob");
  }
}

module.exports = {
  getAuthToken,
  createOrder,
  getPaymentKey
};
