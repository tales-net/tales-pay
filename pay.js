const axios = require('axios');
const path = require('path');
const { getCheckoutPage } = require('./checkout');

// أسماء الفروع المعتمدة في النظام
const BRANCH_NAMES = {
  main: 'حكايات نت رئيسي',
  branch2: 'حكايات نت فرع ثاني',
  branch3: 'حكايات نت فرع ثالث'
};

/**
 * دالة مساعدة لتنظيف وتنسيق أرقام الهواتف المحمولة في مصر
 * تضمن إرجاع 11 رقم يبدأ بـ 01 (مثل محافظ فودافون، اتصالات، أورنج، وي)
 */
function sanitizeEgyptianPhone(phone) {
  if (!phone) return null;
  
  // إزالة أي رموز أو حروف أو مسافات
  let cleaned = String(phone).replace(/\D/g, "");

  // إذا كان الرقم مكتوباً بالرمز الدولي (مثل 2010... أو 002010...)
  if (cleaned.startsWith("20") && cleaned.length === 13) {
    cleaned = cleaned.substring(2);
  }

  // التأكد من أن الرقم يحتوي على 11 رقم ويبدأ بـ 01
  if (cleaned.length === 11 && cleaned.startsWith("01")) {
    return cleaned;
  }

  return null;
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
    console.error("❌ Paymob Auth Error Details:", JSON.stringify(err.response?.data || err.message, null, 2));
    throw new Error("فشل الحصول على توكن المصادقة من Paymob");
  }
}

/**
 * 2. إنشاء طلب دفع (Order Registration) مع ربط بيانات الفرع
 */
async function createOrder(authToken, amountCents, branchData = {}) {
  try {
    const branchKey = branchData.branch || 'main';
    const branchName = branchData.branch_name || BRANCH_NAMES.main;

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
 * 3. توليد مفتاح الدفع (Payment Key Request) مع تضمين الفرع ورقم الهاتف المنظف
 */
async function getPaymentKey(authToken, orderId, amountCents, integrationId, phone = "01000000000", branchData = {}) {
  try {
    const branchKey = branchData.branch || 'main';
    const branchName = branchData.branchName || BRANCH_NAMES.main;

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
        phone_number: phone,
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
 * 4. الدالة الرئيسية لمعالجة الدفع وإنشاء الرابط أو التوجيه
 */
async function createPaymobPayment(phone, amount, method = 'wallet', branch = '', req = null, res = null) {
  try {
    const amountCents = Math.round(parseFloat(amount) * 100).toString();
    const cleanMethod = (method || 'wallet').toLowerCase();

    // ─── 1. تنظيف وفحص رقم المحفظة لضمان التفاعل مع فودافون كاش ───
    const sanitizedPhone = sanitizeEgyptianPhone(phone);

    if (cleanMethod === 'wallet' && !sanitizedPhone) {
      console.warn(`⚠️ [Pay.js] تم رفض العملية: رقم المحفظة غير صحيح أو غير مصري [${phone}]`);
      throw new Error("يرجى كتابة رقم محفظة فودافون كاش صحيح مكون من 11 رقم يبدأ بـ 01");
    }

    const finalPhone = sanitizedPhone || "01000000000";

    // ─── 2. التحقق الصارم من الفرع ───
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

    console.log(`💳 [Pay.js] إنشاء معاملة مؤكدة | الفرع: ${branchDisplayName} (${selectedBranch}) | الرقم: ${finalPhone} | المبلغ: ${amount} | الوسيلة: ${cleanMethod}`);

    // ─── 3. تحديد Integration ID ───
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

    // ─── 4. طلب التوكن والطلب ومفتاح الدفع ───
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
      finalPhone,
      { branch: selectedBranch, branchName: branchDisplayName }
    );

    // ─── 5. تنفيذ طلب الخصم حسب الوسيلة ───
    if (cleanMethod === 'wallet') {
      const walletRes = await axios.post('https://accept.paymob.com/api/acceptance/payments/pay', {
        source: {
          identifier: finalPhone, // ⚡ إرسال الرقم المنظف حصراً لإرسال إشعار الدفع بفودافون كاش
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
  getAuthToken,
  createOrder,
  getPaymentKey,
  sanitizeEgyptianPhone,
  BRANCH_NAMES
};
