const axios = require('axios');
const path = require('path');
const { getCheckoutPage } = require('./checkout');

const BRANCH_NAMES = {
  main: 'حكايات نت رئيسي',
  branch2: 'حكايات نت فرع ثاني',
  branch3: 'حكايات نت فرع ثالث'
};

/**
 * 🧹 دالة تنظيف وتنسيق رقم المحفظة خصيصاً لفودافون كاش وباقي المحافظ
 * تحول الرقم دائماً لـ 11 رقماً محلياً يبدأ بـ 01
 */
function formatWalletPhone(phoneStr) {
  if (!phoneStr) return "01000000000";
  let cleaned = String(phoneStr).replace(/\D/g, ""); // إزالة الأسهم والرموز

  // تحويل الصيغة الدولية 201x إلى صيغة محلية 01x
  if (cleaned.startsWith("201") && cleaned.length === 12) {
    cleaned = "0" + cleaned.substring(2);
  }

  // إذا أدخل العميل الرقم بدون 0 في البداية (مثل 10xxxx)
  if (cleaned.startsWith("1") && cleaned.length === 10) {
    cleaned = "0" + cleaned;
  }

  return cleaned;
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
 * 3. توليد مفتاح الدفع (Payment Key Request) مع تضمين الفرع
 */
async function getPaymentKey(authToken, orderId, amountCents, integrationId, phone = "01000000000", branchData = {}) {
  try {
    const sanitizedPhone = formatWalletPhone(phone);

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
 * 4. الدالة الرئيسية لمعالجة الدفع وإنشاء الرابط أو التوجيه
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
    const formattedPhone = formatWalletPhone(phone);

    console.log(`💳 [Pay.js] إنشاء معاملة مؤكدة | الفرع: ${branchDisplayName} (${selectedBranch}) | المبلغ: ${amount} | الوسيلة: ${cleanMethod} | الهاتف: ${formattedPhone}`);

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
      formattedPhone,
      { branch: selectedBranch, branchName: branchDisplayName }
    );

    if (cleanMethod === 'wallet') {
      // إرسال طلب الدفع للمحفظة مع الرقم المنسق
      const walletRes = await axios.post('https://accept.paymob.com/api/acceptance/payments/pay', {
        source: {
          identifier: formattedPhone,
          subtype: "WALLET"
        },
        payment_token: paymentKey
      });

      // 🔍 فحص واستخراج أي رابط توجيه متاح في رد Paymob (حيث تختلف المسميات لـ فودافون كاش)
      const redirectUrl = 
        walletRes.data.redirect_url || 
        walletRes.data.iframe_redirection_url || 
        walletRes.data.redirection_url ||
        walletRes.data.pending_redirect_url;

      if (!redirectUrl) {
        console.error("❌ [Paymob Wallet Error Body]:", JSON.stringify(walletRes.data, null, 2));
        throw new Error("لم يتم استرجاع رابط إعادة توجيه المحفظة من Paymob");
      }

      console.log(`🔗 [Wallet Redirect] تم التوجيه لرابط الدفع: ${redirectUrl}`);
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
  BRANCH_NAMES
};
