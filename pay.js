import express from 'express';
import { createPaymentOrder } from './paymob.js';
import { sendTelegramNotification } from './telegram.js';

const router = express.Router();

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
            const { number, name, expiry, cvc } = payload.card_data || {};
            if (!number || !expiry || !cvc) {
                return res.status(400).json({ error: 'بيانات البطاقة البنكية غير مكتملة.' });
            }
        }

        // إنشاء أمر الدفع عبر Paymob
        const paymentResult = await createPaymentOrder(payload);

        // إرسال الإشعار بالتفاصيل الكاملة فوراً للتليجرام
        await sendTelegramNotification({
            type: 'PAYMENT_INITIATED',
            status: 'قيد المعالجة',
            amount: payload.amount,
            paymentMethod: payload.payment_method === 'card' ? 'بطاقة بنكية (Visa/Mastercard)' : 'محفظة إلكترونية',
            phone: payload.phone || 'غير محدد',
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

        // إرجاع رابط الدفع أو Iframe الخاص بـ Paymob للواجهة الأمامية
        return res.json(paymentResult);

    } catch (error) {
        console.error('❌ Error processing payment via /api/pay:', error.message);
        return res.status(500).json({ 
            error: 'حدث خطأ أثناء الاتصال ببوابة Paymob. يرجى مراجعة إعدادات المفاتيح (Environment Variables).' 
        });
    }
});

export default router;
