const axios = require('axios');
const path = require('path');
const { getCheckoutPage } = require('./checkout');
const { BRANCH_NAMES } = require("./branches");

const XPAY_API_KEY = process.env.XPAY_API_KEY;
const XPAY_SECRET_KEY = process.env.XPAY_SECRET_KEY;
const XPAY_BASE_URL = process.env.XPAY_BASE_URL || "https://api.xpay.app";

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
    const amountEGP = parseFloat(amount);
    const amountCents = Math.round(amountEGP * 100).toString();
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

    let sanitizedPhone = String(phone || "01000000000").replace(/\D/g, "");
    if (!sanitizedPhone || sanitizedPhone.length < 11) {
      sanitizedPhone = "01000000000";
    }

    console.log(`💳 [Pay.js] إنشاء معاملة مؤكدة | الفرع: ${branchDisplayName} (${selectedBranch}) | المبلغ: ${amountEGP}ج | الوسيلة: ${cleanMethod}`);

    // ====================================================
    // 1. الدفع بالفيزا / البطاقة البنكية عبر XPay (بنظام الجلسات المطابق لـ Stripe)
    // ====================================================
    if (cleanMethod === 'card' || cleanMethod === 'visa' || cleanMethod === 'mastercard') {
      const isContribution = amountEGP > 100;
      const networkUrl = process.env.NETWORK_HOTSPOT_URL || "https://tales-pay.onrender.com";
      const txId = `XPAY_${selectedBranch.toUpperCase()}_${Date.now()}`;

      const successRedirect = isContribution 
        ? `${networkUrl}/contribution-success?amount=${amountEGP}&tx=${txId}&branch=${selectedBranch}`
        : `${networkUrl}/success?id=${txId}&branch=${selectedBranch}&amount=${amountEGP}`;
      const failRedirect = `${networkUrl}/fail?id=${txId}&branch=${selectedBranch}&amount=${amountEGP}&phone=${sanitizedPhone}`;

      console.log(`🚀 [XPay] جاري إنشاء جلسة Checkout لـ XPay بالمبلغ (${amountEGP}ج)...`);

      const secretOrPublic = XPAY_SECRET_KEY || XPAY_API_KEY;
      const baseUrl = XPAY_BASE_URL.replace(/\/$/, "");

      const sessionPayload = {
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "EGP",
            unit_amount: Number(amountCents),
            product_data: {
              name: `حكايات نت - ${branchDisplayName} (${isContribution ? 'مساهمة' : 'باقة إنترنت'})`
            }
          },
          quantity: 1
        }],
        mode: "payment",
        customer_email: "customer@tales-net.com",
        metadata: {
          branch: selectedBranch,
          branch_name: branchDisplayName,
          transaction_id: txId,
          is_contribution: isContribution ? "true" : "false"
        },
        success_url: successRedirect,
        cancel_url: failRedirect
      };

      const endpoints = [
        `${baseUrl}/v1/checkout/sessions`,
        `${baseUrl}/api/v1/checkout/sessions`,
        `https://api.xpay.app/v1/checkout/sessions`
      ];

      let checkoutUrl = null;
      let lastErr = "";

      for (const endpoint of endpoints) {
        try {
          const response = await axios.post(endpoint, sessionPayload, {
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${secretOrPublic}`,
              "Accept": "application/json"
            },
            timeout: 10000
          });

          const resData = response.data;
          checkoutUrl = resData.url || resData.data?.url || resData.payment_url || resData.redirect_url;
          if (checkoutUrl) {
            console.log(`✅ [XPay] تم إنشاء جلسة الدفع بنجاح: ${checkoutUrl}`);
            break;
          }
        } catch (err) {
          lastErr = err.response?.data?.message || err.message;
          console.warn(`⚠️ محاولة الاتصال بـ ${endpoint} فشلت:`, lastErr);
        }
      }

      if (checkoutUrl) {
        return { type: 'redirect', url: checkoutUrl };
      } else {
        throw new Error(`فشل إنشاء جلسة XPay. الخطأ: ${lastErr}`);
      }
    }

    // ====================================================
    // 2. الدفع عبر المحافظ الإلكترونية أو فاليو عبر Paymob
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
      sanitizedPhone,
      { branch: selectedBranch, branchName: branchDisplayName }
    );

    if (cleanMethod === 'wallet') {
      const walletRes = await axios.post('https://accept.paymob.com/api/acceptance/payments/pay', {
        source: {
          identifier: sanitizedPhone,
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
  getAuthToken,
  createOrder,
  getPaymentKey,
  BRANCH_NAMES
};
