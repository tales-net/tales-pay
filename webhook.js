const express = require("express");
const router = express.Router();
const profiles = require("./profiles");
const { getNextVoucher } = require("./voucher");
const { generateCardImage } = require("./cardGenerator");
const { sendTelegramMessage, sendVoucherWithCardImage } = require("./telegram");

// خريطة عالمية (Global Map) لحفظ صور وبيانات الكروت مؤقتاً لتنزيلها من صفحة النجاح بواسطة id العملية
global.generatedCardsMap = global.generatedCardsMap || new Map();

router.post("/paymob-webhook", async (req, res) => {
  try {
    // 1. استخراج البيانات من Paymob سواء كانت مباشرة أو داخل obj
    const data = req.body;
    const obj = data.obj || data;

    if (!obj || !obj.id) {
      console.error("⚠️ [Webhook] استلام حمولة فارغة أو غير صالحة");
      return res.status(200).send("Invalid payload acknowledged");
    }

    // 2. التحقق من حالة نجاح عملية الدفع
    const isSuccess = obj.success === true || obj.success === "true";
    const transactionId = obj.id;
    const amountCents = obj.amount_cents || obj.order?.amount_cents || 0;
    const amountEgp = (amountCents / 100).toFixed(2);
    const numericAmount = parseFloat(amountEgp);
    const phone = obj.billing_data?.phone_number || obj.customer?.phone_number || "غير محدد";

    if (isSuccess) {
      // 3. تحديد اسم البروفايل/الباقة من ملف profiles.js
      let packageName = "باقة إنترنت شبكة حكايات";
      if (typeof profiles === "function") {
        packageName = profiles(numericAmount);
      } else if (typeof profiles === "object" && profiles !== null) {
        packageName = profiles[numericAmount] || profiles[amountEgp] || profiles[parseInt(numericAmount)] || "باقة إنترنت شبكة حكايات";
      }

      // 4. سحب كارت متاح وغير مستخدم مع ربط رقم المعاملة
      const { card, remaining } = getNextVoucher(numericAmount, transactionId);

      let cardImageBuffer = null;

      if (card) {
        // 5. توليد صورة الكارت الاحترافية باسم شبكة حكايات نت
        cardImageBuffer = await generateCardImage(card.code, packageName, numericAmount, transactionId);

        // 6. حفظ بيانات الكارت والصورة في الذاكرة لتنزيلها من صفحة النجاح
        global.generatedCardsMap.set(transactionId.toString(), {
          buffer: cardImageBuffer,
          code: card.code,
          packageName: packageName,
          amount: numericAmount,
          phone: phone
        });
      }

      // 7. إرفاق بيانات الكارت والباقة بأمر الدفع لرسالة التأكيد النصية
      obj.voucher_code = card ? card.code : "⚠️ لا توجد كروت متاحة بالمخزون";
      obj.package_info = packageName;
      obj.phone = phone;

      // أ. إرسال الرسالة النصية لتأكيد نجاح الدفع (isInitial = false)
      await sendTelegramMessage(obj, false);

      // ب. إرسال صورة الكارت المصممة والتنبيه في حالة بقاء 5 كروت أو أقل
      await sendVoucherWithCardImage(
        {
          amount: numericAmount,
          packageName: packageName,
          card: card,
          remaining: remaining,
          phone: phone,
          transactionId: transactionId
        },
        cardImageBuffer
      );

      console.log(`✅ [Webhook] عملية ناجحة: ${transactionId} | الكارت: ${card ? card.code : 'نفدت الكروت'} | المتبقي: ${remaining}`);

    } else {
      // 8. في حالة فشل عملية الدفع
      obj.phone = phone;
      await sendTelegramMessage(obj, false);
      console.log(`❌ [Webhook] عملية دفع فاشلة: ${transactionId}`);
    }

    // 9. إرجاع استجابة 200 فورية لـ Paymob
    return res.status(200).send("OK");

  } catch (err) {
    console.error("❌ [Webhook Error] خطأ أثناء معالجة الإشعار:", err.message);
    return res.status(200).send("Error handled successfully");
  }
});

module.exports = router;
