const axios = require('axios');
const path = require('path');
const { getCheckoutPage } = require('./checkout');
const { BRANCH_NAMES } = require("./branches");

const XPAY_API_KEY = process.env.XPAY_API_KEY;
const XPAY_SECRET_KEY = process.env.XPAY_SECRET_KEY;

// المسار القياسي المتوافق مع بنية الـ Webhook التي أرسلتها (Stripe-compatible)
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

function generateXPayClientBridgeHtml(amountEGP, sanitizedPhone, selectedBranch, branchDisplayName, isContribution, networkUrl) {
  const secretKey = XPAY_SECRET_KEY || XPAY_API_KEY || "";
  const pubKey = XPAY_API_KEY || XPAY_SECRET_KEY || "";
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
  <title>بوابة الدفع بالبطاقة البنكية | حكايات</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0f172a; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; }
    .loader-box { text-align: center; padding: 30px; background: #1e293b; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 460px; width: 90%; }
    .spinner { width: 50px; height: 50px; border: 5px solid rgba(255,255,255,0.1); border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 20px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { font-size: 18px; margin: 0 0 10px; color: #f8fafc; }
    p { font-size: 14px; color: #94a3b8; margin: 0 0 15px; line-height: 1.6; }
    .status-msg { font-size: 13px; color: #fbbf24; margin-top: 15px; background: rgba(251, 191, 36, 0.1); padding: 12px; border-radius: 8px; display: none; text-align: right; direction: ltr; word-break: break-word; }
    .btn-retry { display: none; margin-top: 15px; padding: 10px 20px; background: #3b82f6; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; text-decoration: none; }
  </style>
</head>
<body>
  <div class="loader-box" id="loader">
    <div class="spinner" id="spinner"></div>
    <h2 id="title">جاري فتح بوابة الدفع (XPay)...</h2>
    <p>المبلغ المطلوب: <strong>${amountEGP} جنيه</strong><br>الفرع: <strong>${branchDisplayName}</strong></p>
    <div class="status-msg" id="status_msg"></div>
    <a href="/" class="btn-retry" id="back_btn">العودة لصفحة الدفع</a>
  </div>

  <script>
    (async function startXPaySession() {
      const statusEl = document.getElementById('status_msg');
      const spinnerEl = document.getElementById('spinner');
      const titleEl = document.getElementById('title');
      const backBtn = document.getElementById('back_btn');

      // هيكل الطلب المتوافق مع نظام Checkout Sessions
      const sessionData = {
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "EGP",
            unit_amount: ${Math.round(amountEGP * 100)},
            product_data: {
              name: "باقة إنترنت / مساهمة - " + "${branchDisplayName}"
            }
          },
          quantity: 1
        }],
        mode: "payment",
        customer_email: "customer@tales-net.com",
        metadata: {
          branch: "${selectedBranch}",
          branch_name: "${branchDisplayName}",
          transaction_id: "${txId}",
          is_contribution: "${isContribution}"
        },
        success_url: "${successRedirect}",
        cancel_url: "${failRedirect}"
      };

      const baseUrl = "${XPAY_BASE_URL}".replace(/\\/$/, "");
      const targets = [
        baseUrl + "/v1/checkout/sessions",
        baseUrl + "/api/v1/checkout/sessions",
        baseUrl + "/v1/sessions"
      ];

      let errorLogs = [];

      for (const targetUrl of targets) {
        try {
          const response = await fetch(targetUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer ${secretKey}",
              "Accept": "application/json"
            },
            body: JSON.stringify(sessionData)
          });

          const text = await response.text();
          let data = {};
          try { data = JSON.parse(text); } catch (e) {}

          if (response.ok) {
            const checkoutUrl = data.url || data.data?.url || data.payment_url || data.redirect_url;
            if (checkoutUrl) {
              window.location.replace(checkoutUrl);
              return;
            }
          } else {
            errorLogs.push(targetUrl + " -> HTTP " + response.status + ": " + (data.message || text.substring(0, 80)));
          }
        } catch (err) {
          errorLogs.push(targetUrl + " -> " + err.message);
        }
      }

      spinnerEl.style.display = "none";
      titleEl.textContent = "خطأ في اتصال الجلسة";
      statusEl.style.display = "block";
      statusEl.innerHTML = "<strong>Logs:</strong><br>" + errorLogs.join("<br><br>");
      backBtn.style.display = "inline-block";
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
    // 1. الدفع بالفيزا / البطاقة البنكية عبر XPay
    // ====================================================
    if (cleanMethod === 'card' || cleanMethod === 'visa' || cleanMethod === 'mastercard') {
      const isContribution = amountEGP > 100;
      const networkUrl = process.env.NETWORK_HOTSPOT_URL || "https://tales-pay.onrender.com";
      const txId = `XPAY_${selectedBranch.toUpperCase()}_${Date.now()}`;

      const successRedirect = isContribution 
        ? `${networkUrl}/contribution-success?amount=${amountEGP}&tx=${txId}&branch=${selectedBranch}`
        : `${networkUrl}/success?id=${txId}&branch=${selectedBranch}&amount=${amountEGP}`;
      const failRedirect = `${networkUrl}/fail?id=${txId}&branch=${selectedBranch}&amount=${amountEGP}&phone=${sanitizedPhone}`;

      console.log(`🚀 [XPay] جاري تمرير المبلغ (${amountEGP}ج) وإنشاء جلسة الدفع للفرع (${selectedBranch})...`);

      try {
        const secretOrPublic = XPAY_SECRET_KEY || XPAY_API_KEY;
        const baseUrl = XPAY_BASE_URL.replace(/\/$/, "");
        
        const response = await fetch(`${baseUrl}/v1/checkout/sessions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${secretOrPublic}`,
            "Accept": "application/json"
          },
          body: JSON.stringify({
            payment_method_types: ["card"],
            line_items: [{
              price_data: {
                currency: "EGP",
                unit_amount: Number(amountCents),
                product_data: {
                  name: "Internet Package - " + branchDisplayName
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
          })
        });

        if (response.ok) {
          const resData = await response.json();
          const checkoutUrl = resData.url || resData.data?.url || resData.payment_url || resData.redirect_url;
          if (checkoutUrl) {
            console.log(`✅ [XPay] تم إنشاء جلسة الدفع بنجاح: ${checkoutUrl}`);
            return { type: 'redirect', url: checkoutUrl };
          }
        }
      } catch (e) {
        console.warn(`⚠️ [XPay Server Attempt]:`, e.message);
      }

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
