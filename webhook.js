const express = require("express");
const router = express.Router();
const profiles = require("./profiles");
const { getNextVoucher } = require("./voucher");
const { generateCardImage } = require("./cardGenerator");
const { sendTelegramMessage, sendVoucherWithCardImage } = require("./telegram");

// خريطة عالمية (Global Map) لحفظ صور وبيانات الكروت مؤقتاً لتنزيلها من صفحة النجاح بواسطة id العملية
global.generatedCardsMap = global.generatedCardsMap || new Map();

/**
 * أسماء الفروع
 */
const BRANCH_NAMES = {
  main: "حكايات نت رئيسي",
  branch2: "حكايات نت فرع ثاني",
  branch3: "حكايات نت فرع ثالث"
};

router.post("/paymob-webhook", async (req, res) => {
  try {
    // 1. استخراج البيانات من Paymob سواء كانت مباشرة أو داخل obj
    const data = req.body;
    const obj = data.obj || data;

    if (!obj || !obj.id) {
      console.error("⚠️ [Webhook] استلام حمولة فارغة أو غير صالحة");
      return res.status(200).send("Invalid payload acknowledged");
    }

    // 2. التحقق من حالة نجاح عملية الدفع واستخراج كافة المعرفات الممكنة
    const isSuccess = obj.success === true || obj.success === "true";
    const transactionId = String(obj.id);
    const orderId = obj.order?.id ? String(obj.order.id) : null;
    const merchantOrderId = obj.order?.merchant_order_id ? String(obj.order.merchant_order_id) : null;

    const amountCents = obj.amount_cents || obj.order?.amount_cents || 0;
    const amountEgp = (amountCents / 100).toFixed(2);
    const numericAmount = parseFloat(amountEgp);

    // استخراج الفرع المختار بأي طريقة متاحة في بيانات Paymob
    const branchKey = 
      obj.extra_data?.branch || 
      obj.order?.extra_data?.branch || 
      obj.merchant_extra?.branch || 
      obj.branch || 
      "main";

    const branchDisplayName = BRANCH_NAMES[branchKey] || BRANCH_NAMES.main;

    // استخراج رقم الهاتف بجميع الاحتمالات الممكنة لضمان وصوله
    const phone = obj.phone || 
                  obj.billing_data?.phone_number || 
                  obj.customer?.phone_number || 
                  obj.order?.shipping_data?.phone_number || 
                  "غير محدد";

    if (isSuccess) {
      // طباعة بيانات الدفع في السيرفر للتحقق والتتبع
      console.log(`💳 [Webhook Debug] معاملة رقم: ${transactionId} (طلب: ${orderId}) | الفرع: ${branchDisplayName} (${branchKey}) | المبلغ بالقروش: ${amountCents} | المبلغ بالجنيه: ${numericAmount}ج`);

      // 3. تحديد اسم البروفايل/الباقة من ملف profiles.js بشكل آمن ودقيق
      let packageName = "باقة إنترنت شبكة حكايات";
      if (typeof profiles.getPackageName === "function") {
        packageName = profiles.getPackageName(numericAmount);
      } else if (typeof profiles === "function") {
        packageName = profiles(numericAmount);
      } else if (typeof profiles === "object" && profiles !== null) {
        packageName = profiles[numericAmount] || profiles[amountEgp] || profiles[parseInt(numericAmount)] || "باقة إنترنت شبكة حكايات";
      }

      // 4. سحب كارت متاح من الفرع المحدد مع ربط المعاملة وقراءة النتيجة بشكل تزامني آمن
      const { card, remaining } = await getNextVoucher(numericAmount, transactionId, branchKey);

      let cardImageBuffer = null;

      if (card) {
        // 5. توليد صورة الكارت الاحترافية باسم شبكة حكايات نت مع تبيين الفرع
        cardImageBuffer = await generateCardImage(card.code, packageName, numericAmount, transactionId, branchDisplayName);

        // 6. كائن بيانات الكارت والصورة
        const cardPayload = {
          buffer: cardImageBuffer,
          code: card.code,
          packageName: packageName,
          amount: numericAmount,
          phone: phone,
          branchKey: branchKey,
          branchName: branchDisplayName,
          createdAt: new Date()
        };

        // 7. ربط البيانات بكافة المفاتيح الممكنة لتجنب التعليق في صفحة النجاح
        global.generatedCardsMap.set(transactionId, cardPayload);
        if (orderId) global.generatedCardsMap.set(orderId, cardPayload);
        if (merchantOrderId) global.generatedCardsMap.set(merchantOrderId, cardPayload);

      } else {
        console.warn(`⚠️ [Webhook Warning] لم يتم العثور على كارت متاح للفئة: ${numericAmount}ج في الفرع: ${branchDisplayName}`);
      }

      // 8. إرفاق بيانات الكارت والباقة والفرع والهاتف بأمر الدفع لرسالة التأكيد النصية
      obj.voucher_code = card ? card.code : "⚠️ لا توجد كروت متاحة بالمخزون";
      obj.package_info = packageName;
      obj.phone = phone;
      obj.branch = branchKey;
      obj.branchName = branchDisplayName;

      // أ. إرسال الرسالة النصية لتأكيد نجاح الدفع (isInitial = false)
      await sendTelegramMessage(obj, false);

      // ب. إرسال صورة الكارت المصممة والتنبيه في حالة بقاء 5 كروت أو أقل مع توضيح الفرع
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

      console.log(`✅ [Webhook SUCCESS] عملية ناجحة: ${transactionId} | الفرع: ${branchDisplayName} | الهاتف: ${phone} | الكارت: ${card ? card.code : 'نفدت الكروت'} | المتبقي: ${remaining}`);

    } else {
      // 9. في حالة فشل عملية الدفع
      obj.phone = phone;
      obj.branch = branchKey;
      obj.branchName = branchDisplayName;
      await sendTelegramMessage(obj, false);
      console.log(`❌ [Webhook FAILED] عملية دفع فاشلة: ${transactionId} | الفرع: ${branchDisplayName}`);
    }

    // 10. إرجاع استجابة 200 فورية لـ Paymob
    return res.status(200).send("OK");

  } catch (err) {
    console.error("❌ [Webhook Error] خطأ أثناء معالجة الإشعار:", err.message);
    return res.status(200).send("Error handled successfully");
  }
});

module.exports = router;
