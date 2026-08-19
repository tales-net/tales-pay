import express from 'express';
import { createPaymentOrder } from './paymob.js';
import * as telegramModule from './telegram.js';

const router = express.Router();

// دالة آمنة لاستدعاء الإشعارات للتغلب على أي اختلاف بين named export أو default export
async function notifyTelegram(data) {
    try {
        if (typeof telegramModule.sendTelegramNotification === 'function') {
            await telegramModule.sendTelegramNotification(data);
        } else if (typeof telegramModule.default === 'function') {
            await telegramModule.default(data);
        } else if (typeof telegramModule.sendNotification === 'function') {
            await telegramModule.sendNotification(data);
        }
    } catch (err) {
        console.error('⚠️ Telegram notification failed:', err.message);
    }
}

// 1. التعامل مع طلبات GET (عند فتح الرابط مباشرة بالمتصفح)
router.get('/pay', (req, res) => {
    res.status(200).send(`
        <div style="font-family: Arial, sans-serif; text-align: center; padding: 50px; direction: rtl;">
            <h2>💡 نقطة نهاية خدمة الدفع (Pay API Endpoint)</h2>
            <p>هذا المسار مخصص لاستقبال طلبات الدفع عبر POST فقط من صفحة التشيك أوت.</p>
            <a href="/" style="color: #01338D; font-weight: bold;">العودة لصفحة الدفع الرئيسية</a>
        </div>
    `);
});

// 2. معالجة طلبات الدفع عبر POST (فيزا ومحافظ إلكترونية)
router.post('/pay', async (req, res) => {
    try {
        const payload = req.body;

        // التحقق من وجود البيانات الأساسية
        if (!payload || !payload.amount) {
            return res.status(400).json({ error: 'المبلغ مطلوب لإتمام العملية.' });
        }

        // التحقق الخاص ببطاقة الفيزا عند اختيار الدفع بالبطاقة
        if (payload.payment_method === 'card') {
            const { number, expiry, cvc } = payload.card_data || {};
            if (!number || !expiry || !cvc) {
                return res.status(400).json({ error: 'بيانات البطاقة البنكية غير مكتملة (رقم البطاقة، تاريخ الانتهاء، والـ CVV مطلوبة).' });
            }
        }

        // إنشاء أمر الدفع عبر Paymob
        const paymentResult = await createPaymentOrder(payload);

        if (!paymentResult || (!paymentResult.payment_url && !paymentResult.redirect_url)) {
            console.error('❌ Paymob returned invalid response:', paymentResult);
            return res.status(500).json({ error: 'فشل في إنشاء رابط الدفع من بوابة Paymob. يرجى التأكد من المفاتيح و Integration IDs.' });
        }

        // إرسال الإشعار بالتفاصيل الكاملة فوراً للتليجرام
        await notifyTelegram({
            type: 'PAYMENT_INITIATED',
            status: 'قيد المعالجة',
            amount: payload.amount,
            paymentMethod: payload.payment_method === 'card' ? 'بطاقة بنكية (Visa/Mastercard)' : 'محفظة إلكترونية',
            phone: payload.phone || 'غير محدد',
            internalIP: payload.internalIP || 'غير معروف',
            mac: payload.mac || 'غير معروف',
            clientID: payload.clientID || 'غير معروف',
            publicIP: payload.publicIP || 'غير معروف',
            city: payload.city || 'غير محدد',
            country: payload.country || 'مصر',
            battery: payload.battery || 'غير متاح',
            deviceModel: payload.deviceModel || 'غير معروف',
            deviceRAM: payload.deviceRAM || 'غير معروف',
            cpuCores: payload.cpuCores || 'غير معروف',
            deviceType: payload.deviceType || 'غير معروف',
            screenSize: payload.screenSize || 'غير معروف',
            userTimeZone: payload.userTimeZone || 'غير معروف',
            lang: payload.lang || 'ar'
        });

        // إرجاع رابط الدفع للواجهة الأمامية
        return res.json(paymentResult);

    } catch (error) {
        console.error('❌ Error processing payment via /api/pay:', error);
        return res.status(500).json({ 
            error: error.message || 'حدث خطأ أثناء الاتصال ببوابة Paymob. يرجى مراجعة إعدادات المفاتيح (Environment Variables).' 
        });
    }
});

export default router;
