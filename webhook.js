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
    // 1. استخراج البيانات من Paymob
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

    if (isSuccess) {
      // 3. تحديد الباقات وسعرها المناسب بناءً على المبلغ المدفوع
      const packageResult = getProfileByAmount(numericAmount);

      // حالة أ: إذا كان المبلغ أقل من أصغر باقة (أقل من 5 جنيه)
      if (packageResult.status === "REJECTED") {
        obj.voucher_code = "❌ لم يتم إصدار كارت";
        obj.package_info = packageResult.message;
        obj.phone = phone;

        await sendTelegramMessage(obj, false);
        console.warn(`⚠️ [Webhook] مبلغ غير كافٍ: ${numericAmount} ج.م | ${transactionId}`);
        return res.status(200).send("OK");
      }

      // حالة ب: المبلغ صالِح ويطابق باقة
      const { packageName, packagePrice } = packageResult;

      // 4. سحب كارت متاح من المخزون بحدود سعر الباقات المستحقة (packagePrice)
      const { card, remaining } = getNextVoucher(packagePrice);

      let cardImageBuffer = null;

      if (card) {
        // 5. توليد صورة الكارت باسم الباقة والمبلغ
        cardImageBuffer = generateCardImage(card.code, packageName, packagePrice, transactionId);

        // 6. حفظ البيانات في الذاكرة لتنزيلها من صفحة النجاح
        global.generatedCardsMap.set(transactionId.toString(), {
          buffer: cardImageBuffer,
          code: card.code,
          packageName: packageName,
          amount: packagePrice,
          paidAmount: numericAmount,
          phone: phone
        });
      }

      // 7. إرفاق البيانات وتفاصيل الشراء لرسالة Telegram
      obj.voucher_code = card ? card.code : "⚠️ لا توجد كروت متاحة بالمخزون";
      obj.package_info = `باقة ${packageName} (${packagePrice} ج.م)`;
      obj.phone = phone;

      // أ. إرسال إشعار الدفع النصي
      await sendTelegramMessage(obj, false);

      // ب. إرسال الكارت والصورة عبر Telegram
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

      console.log(`✅ [Webhook] عملية ناجحة: ${transactionId} | المبلغ المدفوع: ${numericAmount}ج | الباقة: ${packageName} | المتبقي: ${remaining}`);

    } else {
      // 8. في حالة فشل عملية الدفع
      obj.phone = phone;
      await sendTelegramMessage(obj, false);
      console.log(`❌ [Webhook] عملية دفع فاشلة: ${transactionId}`);
    }

    // 9. تأكيد الاستلام لـ Paymob
    return res.status(200).send("OK");

  } catch (err) {
    console.error("❌ [Webhook Error] خطأ أثناء معالجة الإشعار:", err.message);
    return res.status(200).send("Error handled successfully");
  }
});

module.exports = router;
