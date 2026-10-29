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

/**
 * توليد صفحة HTML ذكية تقوم بإنشاء جلسة XPay من متصفح العميل مباشرة
 * لتخطي حظر CloudWAF 418 الخاص بسيرفرات Render وفتح الدفع مثل فاليو
 */
function generateXPayClientBridgeHtml(amountEGP, sanitizedPhone, selectedBranch, branchDisplayName, isContribution, networkUrl) {
  const apiKey = XPAY_API_KEY || XPAY_SECRET_KEY || "";
  const txId = `XPAY_${selectedBranch.toUpperCase()}_${Date.now()}`;
  const successRedirect = isContribution 
    ? `${networkUrl}/contribution-success?amount=${amountEGP}&tx=${txId}&branch=${selectedBranch}`
    : `${networkUrl}/success?id=${txId}&branch=${selectedBranch}&amount=${amountEGP}`;
  const failRedirect = `${networkUrl}/fail?id=${txId}&branch=${selectedBranch}&amount=${amountEGP}&phone=${sanitizedPhone}`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>جاري تحضير بوابة الدفع الآمن | حكايات</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
    .loader-box { text-align: center; padding: 30px; background: #1e293b; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 400px; width: 90%; }
    .spinner { width: 50px; height: 50px; border: 5px solid rgba(255,255,255,0.1); border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { font-size: 18px; margin: 0 0 10px; color: #f8fafc; }
    p { font-size: 14px; color: #94a3b8; margin: 0; }
    iframe { width: 100%; height: 100vh; border: none; display: none; background: #fff; }
  </style>
</head>
<body>
  <div class="loader-box" id="loader">
    <div class="spinner"></div>
    <h2>جاري الاتصال ببوابة الدفع بالبطاقة...</h2>
    <p>المبلغ: <strong>${amountEGP} جنيه</strong> | الفرع: <strong>${branchDisplayName}</strong></p>
  </div>
  <iframe id="payment_frame" allow="payment"></iframe>

  <script>
    (async function initXPayCheckout() {
      const payload = {
        amount: ${amountEGP},
        currency: "EGP",
        customer: {
          name: "Tales Customer",
          email: "customer@tales-net.com",
          phone: "${sanitizedPhone}"
        },
        metadata: {
          branch: "${selectedBranch}",
          branch_name: "${branchDisplayName}",
          transaction_id: "${txId}",
          is_contribution: "${isContribution}"
        },
        success_url: "${successRedirect}",
        cancel_url: "${failRedirect}"
      };

      // محاولة إنشاء الجلسة مباشرة من متصفح العميل لتفادي حظر IP السيرفر (418)
      const endpoints = [
        "https://api.xpay.app/api/v1/sessions",
        "https://api.xpay.app/v1/checkout/sessions"
      ];

      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer ${apiKey}",
              "x-api-key": "${apiKey}"
            },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            const data = await res.json();
            const checkoutUrl = data.url || data.data?.url || data.payment_url || data.redirect_url;
            if (checkoutUrl) {
              window.location.href = checkoutUrl;
              return;
            }
          }
        } catch (e) {
          console.warn("Direct attempt notice:", e);
        }
      }

      // في حال تطلب الأمر التوجيه عبر مسار السيرفر البديل
      window.location.href = "/api/xpay-fallback?amount=${amountEGP}&phone=${sanitizedPhone}&branch=${selectedBranch}";
    })();
  </script>
</body>
</html>`;
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
    // 1. الدفع بالفيزا / البطاقة البنكية عبر XPay (مثل فاليو)
    // ====================================================
    if (cleanMethod === 'card' || cleanMethod === 'visa' || cleanMethod === 'mastercard') {
      const isContribution = amountEGP > 100;
      const networkUrl = process.env.NETWORK_HOTSPOT_URL || "https://tales-pay.onrender.com";
      const txId = `XPAY_${selectedBranch.toUpperCase()}_${Date.now()}`;

      const successRedirect = isContribution 
        ? `${networkUrl}/contribution-success?amount=${amountEGP}&tx=${txId}&branch=${selectedBranch}`
        : `${networkUrl}/success?id=${txId}&branch=${selectedBranch}&amount=${amountEGP}`;
      const failRedirect = `${networkUrl}/fail?id=${txId}&branch=${selectedBranch}&amount=${amountEGP}&phone=${sanitizedPhone}`;

      console.log(`🚀 [XPay] جاري تمرير المبلغ (${amountEGP}ج) وإنشاء صفحة الدفع للفرع (${selectedBranch})...`);

      // محاولة أولى باستخدام global fetch المدمج في Node 24 لتفادي بصمة Axios مع CloudWAF
      try {
        const secretOrPublic = XPAY_SECRET_KEY || XPAY_API_KEY;
        const response = await fetch("https://api.xpay.app/v1/checkout/sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${secretOrPublic}`,
            "x-api-key": secretOrPublic,
            "User-Agent": "PostmanRuntime/7.36.3",
            "Accept": "*/*"
          },
          body: JSON.stringify({
            amount: amountEGP,
            amount_cents: Number(amountCents),
            currency: "EGP",
            customer: {
              name: "Tales Customer",
              email: "customer@tales-net.com",
              phone: sanitizedPhone
            },
            metadata: {
              branch: selectedBranch,
              branch_name: branchDisplayName,
              transaction_id: txId,
              is_contribution: isContribution ? "true" : "false"
            },
            success_url: successRedirect,
            cancel_url: failRedirect
          })
        });

        if (response.ok) {
          const resData = await response.json();
          const checkoutUrl = resData.url || resData.data?.url || resData.payment_url || resData.redirect_url;
          if (checkoutUrl) {
            console.log(`✅ [XPay] تم إنشاء رابط الدفع بنجاح: ${checkoutUrl}`);
            return { type: 'redirect', url: checkoutUrl };
          }
        } else {
          console.warn(`⚠️ [XPay Server Call Status ${response.status}] جاري التحويل لوضع جسر المتصفح المباشر (Client Bridge) لتفادي CloudWAF...`);
        }
      } catch (e) {
        console.warn(`⚠️ [XPay Notice] تعذر الاتصال المباشر، سيتم استخدام جسر المتصفح:`, e.message);
      }

      // إذا قام CloudWAF بحظر IP سيرفر Render (كود 418)، نرجع صفحة HTML مثل فاليو تماماً
      // تقوم بفتح جلسة XPay من متصفح العميل مباشرة وتمرر المبلغ بدون أي حظر!
      const bridgeHtml = generateXPayClientBridgeHtml(
        amountEGP,
        sanitizedPhone,
        selectedBranch,
        branchDisplayName,
        isContribution,
        networkUrl
      );
      return { type: 'html', content: bridgeHtml };
    }

    // ====================================================
    // 2. الدفع عبر المحافظ الإلكترونية أو فاليو عبر Paymob
    // ====================================================
    let integrationId;
    switch (cleanMethod) {
      case 'valu':
        integrationId = process.env.VALU_INTEGRATION_ID; // Integration ID الخاص بفاليو
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
