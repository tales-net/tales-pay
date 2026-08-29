const express = require("express");
const router = express.Router();
const profiles = require("./profiles");
const { getNextVoucher, BRANCH_NAMES } = require("./voucher");
const { generateCardImage } = require("./cardGenerator");
const { sendTelegramMessage, sendVoucherWithCardImage } = require("./telegram");

// خريطة عالمية لحفظ بيانات الكروت في الذاكرة لصفحة النجاح
global.generatedCardsMap = global.generatedCardsMap || new Map();

router.post("/paymob-webhook", async (req, res) => {
  try {
    const data = req.body;
    const obj = data.obj || data;

    if (!obj || !obj.id) {
      console.error("⚠️ [Webhook] استلام حمولة فارغة أو غير صالحة");
      return res.status(200).send("Invalid payload acknowledged");
    }

    const isSuccess = obj.success === true || obj.success === "true";
    const transactionId = String(obj.id);

    // حساب المبلغ وقراءة القروش والجنيهات بدقة
    const amountCents = obj.amount_cents || obj.order?.amount_cents || 0;
    const amountEgp = (amountCents / 100).toFixed(2);
    const numericAmount = parseFloat(amountEgp);

    // استخراج مفتاح الفرع من أمتاد البيانات المتنوعة لـ Paymob
    const branchKey = 
      obj.extra_data?.branch || 
      obj.order?.extra_data?.branch || 
      obj.merchant_extra?.branch || 
      obj.payment_key_claims?.extra_data?.branch ||
      obj.branch || 
      "main";

    const branchDisplayName = BRANCH_NAMES[branchKey] || BRANCH_NAMES.main;

    // استخراج رقم الهاتفك
    const phone = obj.phone || 
                  obj.billing_data?.phone_number || 
                  obj.customer?.phone_number || 
                  obj.order?.shipping_data?.phone_number || 
                  "غير محدد";

    if (isSuccess) {
      // 🛑 منع التكرار: إذا تمت معالجة المعاملة مسبقاً لا تقم بسحب كارت جديد
      if (global.generatedCardsMap.has(transactionId)) {
        console.log(`⚠️ [Webhook] المعاملة رقم ${transactionId} تم معالجتها مسبقاً.`);
        return res.status(200).send("OK (Already Processed)");
      }

      console.log(`💳 [Webhook Debug] معاملة مؤكدة: ${transactionId} | الفرع: ${branchDisplayName} | المبلغ: ${numericAmount}ج`);

      // تحديد اسم الباقة
      let packageName = "باقة إنترنت شبكة حكايات";
      if (typeof profiles.getPackageName === "function") {
        packageName = profiles.getPackageName(numericAmount);
      } else if (typeof profiles === "function") {
        packageName = profiles(numericAmount);
      } else if (typeof profiles === "object" && profiles !== null) {
        packageName = profiles[numericAmount] || profiles[amountEgp] || profiles[parseInt(numericAmount)] || "باقة إنترنت شبكة حكايات";
      }

      // 🎟️ سحب الكارت الحقيقي والوحيد للفرع المحدد
      const { card, remaining } = await getNextVoucher(numericAmount, transactionId, branchKey);

      let cardImageBuffer = null;

      if (card) {
        // إنشاء صورة الكارت
        cardImageBuffer = await generateCardImage(
          card.code, 
          packageName, 
          numericAmount, 
          transactionId, 
          branchDisplayName
        );

        // حفظ بيانات الكارت في الذاكرة لتستطيع صفحة النجاح (Success Page) عرضها مباشرة
        global.generatedCardsMap.set(transactionId, {
          buffer: cardImageBuffer,
          code: card.code,
          packageName: packageName,
          amount: numericAmount,
          phone: phone,
          branchKey: branchKey,
          branchName: branchDisplayName,
          createdAt: new Date()
        });
      } else {
        console.warn(`⚠️ [Webhook Warning] لم يتم العثور على كارت متاح للفئة: ${numericAmount}ج في الفرع: ${branchDisplayName}`);
      }

      // إعداد البيانات للتلجرام
      obj.voucher_code = card ? card.code : "⚠️ لا توجد كروت متاحة بالمخزون";
      obj.package_info = packageName;
      obj.phone = phone;
      obj.branch = branchKey;
      obj.branchName = branchDisplayName;

      // إرسال الإشعارات إلى تلجرام
      await sendTelegramMessage(obj, false);

      await sendVoucherWithCardImage(
        {
          amount: numericAmount,
          packageName: packageName,
          card: card,
          remaining: remaining,
          phone: phone,
          transactionId: transactionId,
          branch: branchKey,
          branchName: branchDisplayName
        },
        cardImageBuffer
      );

      console.log(`✅ [Webhook SUCCESS] تم تأكيد العملية: ${transactionId} | الكارت: ${card ? card.code : 'نفدت الكروت'}`);

    } else {
      // التعامل مع المعاملات الفاشلة
      obj.phone = phone;
      obj.branch = branchKey;
      obj.branchName = branchDisplayName;
      
      await sendTelegramMessage(obj, false);
      console.log(`❌ [Webhook FAILED] عملية دفع فاشلة: ${transactionId}`);
    }

    return res.status(200).send("OK");

  } catch (err) {
    console.error("❌ [Webhook Error] خطأ أثناء معالجة الإشعار:", err.message);
    return res.status(200).send("Error handled successfully");
  }
});

module.exports = router;
