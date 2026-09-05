const axios = require("axios");

const BRANCH_NAMES = {
  main: "حكايات نت رئيسي",
  branch2: "حكايات نت فرع ثاني",
  branch3: "حكايات نت فرع ثالث"
};

/**
 * دالة تنظيف وتنسيق رقم الهاتف المحلي
 */
function normalizeLocalPhone(phoneStr) {
  if (!phoneStr) return "01000000000";
  let cleaned = String(phoneStr).replace(/\D/g, "");
  
  if (cleaned.startsWith("201") && cleaned.length === 12) {
    cleaned = "0" + cleaned.substring(2);
  }
  if (cleaned.startsWith("1") && cleaned.length === 10) {
    cleaned = "0" + cleaned;
  }
  return cleaned.length === 11 ? cleaned : "01000000000";
}

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
async function createOrder(authToken, amountCents, branchData = {}) {
  try {
    const branchKey = branchData.branch || "main";
    const branchName = branchData.branch_name || "حكايات نت رئيسي";

    const response = await axios.post("https://accept.paymob.com/api/ecommerce/orders", {
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
async function getPaymentKey(authToken, orderId, amountCents, integrationId, phone = "01000000000", branchData = {}) {
  try {
    const sanitizedPhone = normalizeLocalPhone(phone);
    const branchKey = branchData.branch || "main";
    const branchName = branchData.branchName || "حكايات نت رئيسي";

    const response = await axios.post("https://accept.paymob.com/api/acceptance/payment_keys", {
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
    });
    return response.data.token;
  } catch (err) {
    console.error("❌ Paymob Payment Key Error:", err.response?.data || err.message);
    throw new Error("فشل توليد مفتاح الدفع من Paymob");
  }
}

/**
 * 4. الدالة الرئيسية لمعالجة طلبات الدفع
 */
async function processPayment(phone, amount, method = "wallet", branch = "", req = null, res = null) {
  try {
    const amountCents = Math.round(parseFloat(amount) * 100).toString();
    const cleanMethod = (method || "wallet").toLowerCase();
    
    let rawBranch = String(branch || "").toLowerCase().trim();
    if (!rawBranch && req) {
      rawBranch = String(req.body?.branch || req.query?.branch || "main").toLowerCase().trim();
    }

    const selectedBranch = BRANCH_NAMES[rawBranch] ? rawBranch : "main";
    const branchDisplayName = BRANCH_NAMES[selectedBranch];
    const formattedPhone = normalizeLocalPhone(phone);

    console.log(`💳 [Pay.js] معالجة طلب الدفع | الفرع: ${branchDisplayName} | المبلغ: ${amount} | الوسيلة: ${cleanMethod} | الهاتف: ${formattedPhone}`);

    const integrationId = cleanMethod === "card"
      ? process.env.CARD_INTEGRATION_ID
      : (process.env.WALLET_INTEGRATION_ID || process.env.INTEGRATION_ID);

    if (!integrationId) {
      throw new Error(`Missing Integration ID for method: ${cleanMethod}`);
    }

    const token = await getAuthToken();
    const orderId = await createOrder(token, amountCents, { branch: selectedBranch, branch_name: branchDisplayName });
    const paymentKey = await getPaymentKey(token, orderId, amountCents, integrationId, formattedPhone, { branch: selectedBranch, branchName: branchDisplayName });

    const iframeId = process.env.PAYMOB_IFRAME_ID;
    if (!iframeId) {
      throw new Error("Missing PAYMOB_IFRAME_ID in environment variables");
    }

    const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`;
    return { type: "redirect", url: iframeUrl };

  } catch (err) {
    console.error("❌ Paymob Processing Error:", err.response?.data || err.message);
    throw new Error(`Payment processing failed: ${err.message}`);
  }
}

// 🔑 تصدير مرن يمنع ظهور خطأ "processPayment is not a function" سواء استدعيت الدالة مباشرة أو استخرجتها كـ Object Property
module.exports = processPayment;
module.exports.processPayment = processPayment;
module.exports.createPaymobPayment = processPayment;
module.exports.getAuthToken = getAuthToken;
module.exports.createOrder = createOrder;
module.exports.getPaymentKey = getPaymentKey;
module.exports.BRANCH_NAMES = BRANCH_NAMES;
