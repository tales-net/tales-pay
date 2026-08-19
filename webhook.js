const express = require("express");
const router = express.Router();

// استدعاء الوحدات البرمجية
const { getProfileByAmount } = require("./profiles");
const { getNextVoucher } = require("./voucher");
const { generateCardImage } = require("./cardGenerator");
const { sendTelegramMessage, sendVoucherWithCardImage } = require("./telegram");

// ذاكرة مؤقتة عالمية لحفظ بيانات الكروت المنشأة لتنزيلها من صفحة النجاح
global.generatedCardsMap = global.generatedCardsMap || new Map();

// خريطة لتتبع المعاملات المعالجة لمنع التكرار (Idempotency)
const processedTransactions = new Set();

/**
 * تنظيف الكروت القديمة من الذاكرة كل ساعتين لمنع استهلاك Memory Leak
 */
const CARD_TTL_MS = 2 * 60 * 60 * 1000; // ساعتان
function saveCardToMemory(transactionId, cardData) {
  global.generatedCardsMap.set(transactionId.toString(), {
    ...cardData,
    createdAt: Date.now()
  });

  setTimeout(() => {
    global.generatedCardsMap.delete(transactionId.toString());
  }, CARD_TTL_MS);
}

router.post("/paymob-webhook", async (req, res) => {
  try {
    // 1. استخراج واستخراج بيانات Paymob
    const payload = req.body || {};
    const obj = payload.obj || payload;

    if (!obj || !obj.id) {
      console.error("⚠️ [Webhook] حمولة بيانات فارغة أو غير صالحة");
      return res.status(200).send("Invalid payload acknowledged");
    }

    const transactionId = obj.id.toString();

    // 2. فحص المعالجة المكررة (Duplicate Event Prevention)
    if (processedTransactions.has(transactionId)) {
      console.warn(`⚠️ [Webhook] تم التغاضي عن معاملة مكررة: #${transactionId}`);
      return res.status(200).send("Duplicate transaction acknowledged");
    }

    const isSuccess = obj.success === true || obj.success === "true";
    const amountCents = obj.amount_cents || obj.order?.amount_cents || 0;
    const numericAmount = parseFloat((amountCents / 100).toFixed(2));
    const phone = obj.billing_data?.phone_number || obj.customer?.phone_number || "غير محدد";

    // -------------------------------------------------------------
    // ❌ حالة 1: فشل عملية الدفع
    // -------------------------------------------------------------
    if (!isSuccess) {
      console.log(`❌ [Webhook] عملية دفع فاشلة برقم: #${transactionId}`);

      const failureData = {
        ...obj,
        phone,
        voucher_code: "❌ عملية فاشلة (لم يتم إصدار كارت)",
        package_info: `فشل دفع مبلغ ${numericAmount} ج.م`
      };

      if (typeof sendTelegramMessage === "function") {
        await sendTelegramMessage(failureData, false).catch(err => 
          console.error("❌ [Telegram Error]:", err.message)
        );
      }

      return res.status(200).send("Payment failure acknowledged");
    }

    // تسويج المعاملة كمعالجة
    processedTransactions.add(transactionId);
    // إزالة الرقم من ذاكرة التكرار بعد 24 ساعة
    setTimeout(() => processedTransactions.delete(transactionId), 24 * 60 * 60 * 1000);

    // -------------------------------------------------------------
    // ✅ حالة 2: نجاح عملية الدفع الفعلية
    // -------------------------------------------------------------
    console.log(`✅ [Webhook] معالجة عملية ناجحة: #${transactionId} | المبلغ: ${numericAmount} ج.م`);

    // 3. تحديد الباقة المستحقة بناءً على المبلغ
    const packageResult = getProfileByAmount(numericAmount);

    if (packageResult.status === "REJECTED") {
      const rejectedData = {
        ...obj,
        phone,
        voucher_code: "❌ لم يتم إصدار كارت (مبلغ غير كافٍ)",
        package_info: packageResult.message
      };

      if (typeof sendTelegramMessage === "function") {
        await sendTelegramMessage(rejectedData, false).catch(err => 
          console.error("❌ [Telegram Error]:", err.message)
        );
      }
      console.warn(`⚠️ [Webhook] مبلغ غير كافٍ للباقة: ${numericAmount} ج.م | #${transactionId}`);
      return res.status(200).send("Insufficient amount acknowledged");
    }

    const { packageName, packagePrice } = packageResult;

    // 4. سحب الكارت المتاح من المخزون
    const { card, remaining } = getNextVoucher(packagePrice) || {};

    let cardImageBuffer = null;

    if (card && card.code) {
      // 5. إنشاء صورة الكارت
      try {
        if (typeof generateCardImage === "function") {
          cardImageBuffer = await generateCardImage(card.code, packageName, packagePrice, transactionId);
        }
      } catch (imgErr) {
        console.error("❌ [Webhook] خطأ أثناء إنشاء صورة الكارت:", imgErr.message);
      }

      // 6. التخزين المؤقت للبيانات
      saveCardToMemory(transactionId, {
        buffer: cardImageBuffer,
        code: card.code,
        packageName,
        amount: packagePrice,
        paidAmount: numericAmount,
        phone
      });
    }

    // 7. تجهيز البيانات وإرسال التنبيهات
    const notifyData = {
      ...obj,
      phone,
      voucher_code: card ? card.code : "⚠️ لا توجد كروت متاحة بالمخزون!",
      package_info: `باقة ${packageName} (${packagePrice} ج.م)`
    };

    // أ. إشعار نصي
    if (typeof sendTelegramMessage === "function") {
      await sendTelegramMessage(notifyData, false).catch(err => 
        console.error("❌ [Telegram Msg Error]:", err.message)
      );
    }

    // ب. إشعار الكارت والصورة
    if (typeof sendVoucherWithCardImage === "function") {
      await sendVoucherWithCardImage(
        {
          amount: numericAmount,
          packagePrice,
          packageName,
          card,
          remaining,
          phone,
          transactionId
        },
        cardImageBuffer
      ).catch(err => console.error("❌ [Telegram Image Error]:", err.message));
    }

    console.log(`🎉 [Webhook] إتمام العملية: #${transactionId} | الباقة: ${packageName} | المتبقي: ${remaining}`);

    return res.status(200).send("OK");

  } catch (err) {
    console.error("❌ [Webhook Critical Error]:", err.message);
    // إرجاع 200 لمنع Paymob من إعادة التكرار اللانهائي في حال الخطأ الداخلي
    return res.status(200).send("Error handled successfully");
  }
});

module.exports = router;
