import express from 'express';
import axios from 'axios';
import { getCheckoutPage } from './checkout.js';
import { getAuthToken, createOrder, getPaymentKey } from './paymob.js';
import { sendTelegramNotification } from './telegram.js';

const router = express.Router();

/**
 * إنشاء المعاملة وتجهيز رابط الدفع الخاص بـ Paymob (محافظ أو بطاقات بنكية فقط)
 * @param {string} phone - رقم الهاتف أو المحفظة
 * @param {string|number} amount - المبلغ بالجنيه
 * @param {string} method - وسيلة الدفع (wallet, card)
 * @returns {Promise<{type: string, url?: string, content?: string}>}
 */
export async function createPaymobPayment(phone, amount, method = 'wallet') {
  try {
    // 1. تحويل المبلغ إلى قروش (Cents) وتوحيد نص وسيلة الدفع
    const amountCents = Math.round(parseFloat(amount) * 100).toString();
    const cleanMethod = (method || 'wallet').toLowerCase();

    // 2. تحديد Integration ID المناسب (محفظة أو بطاقة بنكية فقط)
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

    // 3. الحصول على توكن المصادقة، رقم الطلب، ومفتاح الدفع
    const token = await getAuthToken();
    const orderId = await createOrder(token, amountCents);
    const paymentKey = await getPaymentKey(token, orderId, amountCents, integrationId, phone || '01000000000');

    // 4. معالجة وسيلة المحفظة الإلكترونية (Mobile Wallet)
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
    
    // 5. معالجة البطاقات البنكية (Card)
    else {
      const iframeId = process.env.CARD_IFRAME_ID || process.env.PAYMOB_IFRAME_ID;

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
    console.error('❌ Paymob Payment Integration Error:', err.response?.data || err.message);
    throw new Error(`Payment processing failed: ${err.message}`);
  }
}

// مسار استقبال طلبات الدفع من الواجهة الأمامية
router.post('/pay', async (req, res) => {
    try {
        const payload = req.body;

        if (!payload || !payload.amount) {
            return res.status(400).json({ error: 'المبلغ مطلوب لإتمام العملية' });
        }

        const paymentResult = await createPaymobPayment(
            payload.phone,
            payload.amount,
            payload.payment_method
        );

        // إرسال إشعار التليجرام بالبيانات الحقيقية
        await sendTelegramNotification({
            type: 'PAYMENT_INITIATED',
            status: 'قيد المعالجة',
            amount: payload.amount,
            paymentMethod: payload.payment_method,
            phone: payload.phone,
            internalIP: payload.internalIP,
            mac: payload.mac,
            clientID: payload.clientID,
            publicIP: payload.publicIP,
            city: payload.city,
            country: payload.country,
            battery: payload.battery,
            deviceModel: payload.deviceModel,
            deviceRAM: payload.deviceRAM,
            cpuCores: payload.cpuCores,
            deviceType: payload.deviceType,
            screenSize: payload.screenSize,
            userTimeZone: payload.userTimeZone,
            lang: payload.lang
        });

        // إرجاع رابط الدفع أو الصفحة بحسب نوع العملية
        if (paymentResult.type === 'redirect') {
            return res.json({ payment_url: paymentResult.url });
        } else if (paymentResult.type === 'html') {
            return res.send(paymentResult.content);
        }

    } catch (error) {
        console.error('❌ Error in /pay route:', error.message);
        return res.status(500).json({ error: 'حدث خطأ أثناء معالجة عملية الدفع' });
    }
});

export default router;
