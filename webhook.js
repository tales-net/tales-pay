const express = require("express");
const router = express.Router();
const { getProfileByAmount } = require("./profiles");
const { getNextVoucher } = require("./voucher");
const { generateCardImage } = require("./cardGenerator");
const { sendTelegramMessage, sendVoucherWithCardImage } = require("./telegram");

// خريطة عالمية لحفظ صور الكروت مؤقتاً لتنزيلها من صفحة النجاح بواسطة id العملية
global.generatedCardsMap = global.generatedCardsMap || new Map();

router.post("/paymob-webhook", async (req, res) => {
  try {
    // 1. استخراج البيانات من حمولة Paymob
    const data = req.body;
    const obj = data.obj || data;

    if (!obj || !obj.id) {
      console.error("⚠️ [Webhook] استلام حمولة فارغة أو غير صالحة");
      return res.status(200).send("Invalid payload acknowledged");
    }

    // 2. التحقق من حالة نجاح عملية الدفع والمبلغ
    const isSuccess = obj.success === true || obj.success === "true";
    const transactionId = obj.id;
    const amountCents = obj.amount_cents || obj.order?.amount_cents || 0;
    const numericAmount = parseFloat((amountCents / 100).toFixed(2));
    const phone = obj.billing_data?.phone_number || obj.customer?.phone_number || "غير محدد";

    // -------------------------------------------------------------
    // ❌ حالة 1: فشل عملية الدفع (محفظة معطلة / رصيد غير كافٍ / إلغاء)
    // -------------------------------------------------------------
    if (!isSuccess) {
      console.log(`❌ [Webhook] عملية دفع فاشلة برقم: #${transactionId}`);

      // إعداد كائن البيانات لرسالة تليجرام موضحة الفشل
      obj.phone = phone;
      obj.voucher_code = "❌ عملية فاشلة (لم يتم إصدار كارت)";
      obj.package_info = `فشل دفع مبلغ ${numericAmount} ج.م`;

      // إرسال إشعار الفشل النصي فقط إلى تليجرام
      if (typeof sendTelegramMessage === "function") {
        await sendTelegramMessage(obj, false);
      }

      return res.status(200).send("Payment failure acknowledged");
    }

    // -------------------------------------------------------------
    // ✅ حالة 2: نجاح عملية الدفع الفعلية (isSuccess === true)
    // -------------------------------------------------------------
    console.log(`✅ [Webhook] بدء معالجة عملية ناجحة: #${transactionId} | المبلغ: ${numericAmount} ج.م`);

    // 3. تحديد الباقة المستحقة بناءً على المبلغ
    const packageResult = getProfileByAmount(numericAmount);

    // حالة أ: إذا كان المبلغ المدفوع أقل من أصغر باقة متاحة
    if (packageResult.status === "REJECTED") {
      obj.voucher_code = "❌ لم يتم إصدار كارت (مبلغ غير كافٍ)";
      obj.package_info = packageResult.message;
      obj.phone = phone;

      if (typeof sendTelegramMessage === "function") {
        await sendTelegramMessage(obj, false);
      }
      console.warn(`⚠️ [Webhook] مبلغ غير كافٍ للباقة: ${numericAmount} ج.م | #${transactionId}`);
      return res.status(200).send("Insufficient amount acknowledged");
    }

    // حالة ب: المبلغ مطابق لباقة صالحة
    const { packageName, packagePrice } = packageResult;

    // 4. سحب أول كارت غير مستخدم من المخزون وحذفه/تعليمه فوراً
    const { card, remaining } = getNextVoucher(packagePrice);

    let cardImageBuffer = null;

    if (card && card.code) {
      // 5. توليد صورة الكارت مع استخدام await لضمان اكتمال معالجة الصورة بـ Sharp
      try {
        cardImageBuffer = await generateCardImage(card.code, packageName, packagePrice, transactionId);
      } catch (imgErr) {
        console.error("❌ [Webhook] خطأ أثناء إنشاء صورة الكارت:", imgErr.message);
      }

      // 6. حفظ بيانات الكارت المكتملة في الذاكرة لتتيح التحميل من صفحة /success
      global.generatedCardsMap.set(transactionId.toString(), {
        buffer: cardImageBuffer,
        code: card.code,
        packageName: packageName,
        amount: packagePrice,
        paidAmount: numericAmount,
        phone: phone
      });
    }

    // 7. تجهيز وإرسال تفاصيل العملية إلى Telegram
    obj.voucher_code = card ? card.code : "⚠️ لا توجد كروت متاحة بالمخزون!";
    obj.package_info = `باقة ${packageName} (${packagePrice} ج.م)`;
    obj.phone = phone;

    // أ. إرسال الإشعار النصي العام
    if (typeof sendTelegramMessage === "function") {
      await sendTelegramMessage(obj, false);
    }

    // ب. إرسال الكارت والصورة التفصيلية للتليجرام
    if (typeof sendVoucherWithCardImage === "function") {
      await sendVoucherWithCardImage(
        {
          amount: numericAmount,
          packagePrice: packagePrice,
          packageName: packageName,
          card: card,
          remaining: remaining,
          phone: phone,
          transactionId: transactionId
        },
        cardImageBuffer
      );
    }

    console.log(`🎉 [Webhook] تم الشراء بنجاح: #${transactionId} | الباقة: ${packageName} | المتبقي: ${remaining}`);

    // 8. تأكيد استلام الإشعار لسيرفرات Paymob
    return res.status(200).send("OK");

  } catch (err) {
    console.error("❌ [Webhook Error] خطأ أثناء معالجة الإشعار:", err.message);
    return res.status(200).send("Error handled successfully");
  }
});

module.exports = router;
