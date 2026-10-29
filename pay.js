const axios = require('axios');
const path = require('path');
const { getCheckoutPage } = require('./checkout');
const { BRANCH_NAMES } = require("./branches");

const XPAY_API_KEY = process.env.XPAY_API_KEY;
const XPAY_SECRET_KEY = process.env.XPAY_SECRET_KEY;

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

async function processPayment(userPhone, payAmount, selectedMethod, branch, req, res) {
  try {
    const cleanMethod = (selectedMethod || 'wallet').toLowerCase();
    const amountEGP = parseFloat(payAmount);
    const amountCents = Math.round(amountEGP * 100).toString();

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

    console.log(`💳 [Payment Router] وسيلة الدفع: ${cleanMethod} | المبلغ: ${amountEGP}ج | الفرع: ${branchDisplayName} (${selectedBranch})`);

    // ==========================================
    // 1. الدفع بالبطاقة البنكية (Visa / MasterCard) عبر XPay
    // ==========================================
    if (cleanMethod === "card" || cleanMethod === "visa" || cleanMethod === "mastercard") {
      console.log("🚀 [XPay] جاري تمرير المبلغ وإنشاء جلسة دفع بالبطاقة البنكية...");

      const networkUrl = process.env.NETWORK_HOTSPOT_URL || "https://tales-pay.onrender.com";
      const isContribution = amountEGP > 100;

      if (isContribution) {
        console.log(`🌸 [XPay المساهمات] المبلغ ${amountEGP}ج أكبر من 100ج، سيتم معالجته كمساهمة.`);
      }

      // إضافة رؤوس طلبيات تحاكي متصفح حقيقي لتجنب حظر WAF
      const xpayResponse = await axios.post(
        "https://api.xpay.app/v1/checkout/sessions",
        {
          amount: amountEGP,
          currency: "egp",
          customer_details: {
            email: "customer@tales-net.com",
            phone: userPhone !== "غير محدد" && userPhone ? userPhone : "01000000000"
          },
          merchant_extra: {
            branch: selectedBranch,
            branch_name: branchDisplayName,
            is_contribution: isContribution ? "true" : "false"
          },
          success_url: `${networkUrl}/success?branch=${selectedBranch}&amount=${amountEGP}`,
          cancel_url: `${networkUrl}/fail?branch=${selectedBranch}`
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${XPAY_SECRET_KEY || XPAY_API_KEY}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://tales-pay.onrender.com"
          }
        }
      );

      const checkoutUrl = xpayResponse.data?.url || xpayResponse.data?.data?.url || xpayResponse.data?.redirect_url;
      
      if (checkoutUrl) {
        return { type: "redirect", url: checkoutUrl };
      } else {
        throw new Error("تعذر الحصول على رابط التوجيه من استجابة XPay");
      }
    }

    // ==========================================
    // 2. الدفع عبر المحافظ الإلكترونية أو فاليو عبر Paymob
    // ==========================================
    else {
      console.log("📱 [Paymob] جاري إنشاء معاملة Paymob للمحافظ/فاليو...");

      let integrationId;
      switch (cleanMethod) {
        case 'valu':
          integrationId = process.env.VALU_INTEGRATION_ID || process.env.PAYMOB_INTEGRATION_ID_VALU;
          break;
        case 'wallet':
        default:
          integrationId = process.env.WALLET_INTEGRATION_ID || process.env.PAYMOB_INTEGRATION_ID_WALLET;
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
        userPhone || '01000000000',
        { branch: selectedBranch, branchName: branchDisplayName }
      );

      if (cleanMethod === 'wallet' && userPhone && userPhone !== "غير محدد") {
        const walletPayRes = await axios.post('https://accept.paymob.com/api/acceptance/payments/pay', {
          source: {
            identifier: userPhone,
            subtype: "WALLET"
          },
          payment_token: paymentKey
        });

        const redirectUrl = walletPayRes.data.iframe_redirection_url || walletPayRes.data.redirection_url;
        if (!redirectUrl) {
          throw new Error("لم يتم استرجاع رابط إعادة توجيه المحفظة من Paymob");
        }
        return { type: 'redirect', url: redirectUrl };
      } 
      else if (cleanMethod === 'valu') {
        const iframeId = process.env.VALU_IFRAME_ID || process.env.PAYMOB_IFRAME_ID;
        
        if (typeof getCheckoutPage === 'function') {
          const htmlPage = getCheckoutPage(paymentKey, iframeId);
          return { type: 'html', content: htmlPage };
        }
        
        const iframeUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`;
        return { type: 'redirect', url: iframeUrl };
      } 
      else {
        const iframeId = process.env.PAYMOB_IFRAME_ID;
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
    }

  } catch (err) {
    console.error('❌ [Payment Error Details]:', err.response?.data || err.message);
    throw new Error(`Payment processing failed: ${err.response?.data?.message || err.message}`);
  }
}

module.exports = { 
  createPaymobPayment: processPayment, 
  processPayment,
  getAuthToken,
  createOrder,
  getPaymentKey,
  BRANCH_NAMES
};
