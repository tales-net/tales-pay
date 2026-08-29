const express = require("express");
const router = express.Router();
const profiles = require("./profiles");
const { processPaymentAndCreateCard } = require("./mikrotikService"); // استدعاء خدمة الميكروتيك الجديدة
const { generateCardImage } = require("./cardGenerator");
const { sendTelegramMessage, sendVoucherWithCardImage } = require("./telegram");

// خريطة عالمية لحفظ بيانات وكروت المعاملات مؤقتاً لصفحة النجاح
global.generatedCardsMap = global.generatedCardsMap || new Map();

const BRANCH_NAMES = {
  main: "حكايات نت رئيسي",
  branch2: "حكايات نت فرع ثاني",
  branch3: "حكايات نت فرع ثالث"
};

/**
 * دالة دقيقة لاستخراج الفرع من حمولة Paymob
 */
function extractBranchKey(obj) {
  const directBranch = 
    obj.merchant_extra?.branch ||
    obj.order?.merchant_extra?.branch ||
    obj.extra_data?.branch || 
    obj.order?.extra_data?.branch || 
    obj.branch || 
    obj.order?.branch;

  if (directBranch && BRANCH_NAMES[directBranch]) {
    return directBranch;
  }

  const merchantOrderId = String(obj.order?.merchant_order_id || obj.merchant_order_id || "").toLowerCase();
  
  if (merchantOrderId.includes("branch2")) return "branch2";
  if (merchantOrderId.includes("branch3")) return "branch3";
  if (merchantOrderId.includes("main")) return "main";

  return "main";
}

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
    const orderId = obj.order?.id ? String(obj.order.id) : null;
    const merchantOrderId = obj.order?.merchant_order_id ? String(obj.order.merchant_order_id) : null;

    const amountCents = obj.amount_cents || obj.order?.amount_cents || 0;
    const amountEgp = (amountCents / 100).toFixed(2);
    const numericAmount = parseFloat(amountEgp);

    const branchKey = extractBranchKey(obj);
    const branchDisplayName = BRANCH_NAMES[branchKey] || BRANCH_NAMES.main;

    const phone = obj.phone || 
                  obj.billing_data?.phone_number || 
                  obj.customer?.phone_number || 
                  obj.order?.shipping_data?.phone_number || 
                  "غير محدد";

    if (isSuccess) {
      console.log(`💳 [Webhook Debug] معاملة ناجحة: ${transactionId} | الفرع: ${branchDisplayName} (${branchKey}) | المبلغ: ${numericAmount}ج`);

      // تحديد اسم الباقة عبر ملف profiles.js
      let packageName = "باقة إنترنت شبكة حكايات";
      if (typeof profiles.getPackageName === "function") {
        packageName = profiles.getPackageName(numericAmount);
      } else if (typeof profiles === "function") {
        packageName = profiles(numericAmount);
      } else if (typeof profiles === "object" && profiles !== null) {
        packageName = profiles[numericAmount] || profiles[amountEgp] || "باقة إنترنت شبكة حكايات";
      }

      // 🚀 توليد الكارت الحقيقي تلقائياً في راوتر الميكروتيك الخاص بالفرع
      const cardResult = await processPaymentAndCreateCard(numericAmount, branchKey, transactionId);

      let cardImageBuffer = null;
      let cardCode = null;

      if (cardResult.success) {
        if (cardResult.isCustomAmount) {
          // التعامل مع المبالغ المختلفة / التبرعات
          console.log(`🌸 [Custom Amount] تم استقبال مساهمة بقيمة ${numericAmount}ج`);
        } else {
          cardCode = cardResult.cardCode;
          packageName = cardResult.packageName || packageName;

          // توليد صورة الكارت الاحترافية
          cardImageBuffer = await generateCardImage(cardCode, packageName, numericAmount, transactionId, branchDisplayName);

          const cardPayload = {
            buffer: cardImageBuffer,
            code: cardCode,
            packageName: packageName,
            amount: numericAmount,
            phone: phone,
            branchKey: branchKey,
            branchName: branchDisplayName,
            createdAt: new Date()
          };

          // حفظ البيانات للاستعلام عنها من صفحة النجاح
          global.generatedCardsMap.set(transactionId, cardPayload);
          if (orderId) global.generatedCardsMap.set(orderId, cardPayload);
          if (merchantOrderId) global.generatedCardsMap.set(merchantOrderId, cardPayload);
        }
      } else {
        console.error(`🚨 [Webhook Error] فشل إنشاء الكارت للمبلغ ${numericAmount}ج:`, cardResult.error);
      }

      // تحديث كائن البيانات لإرساله عبر التليجرام
      obj.voucher_code = cardCode || "⚠️ تعذر الإصدار الآلي";
      obj.package_info = packageName;
      obj.phone = phone;
      obj.branch = branchKey;
      obj.branchName = branchDisplayName;

      // 1. إرسال إشعار التليجرام النصي للعملية
      await sendTelegramMessage(obj, false);

      // 2. إرسال صورة الكارت والتفاصيل لتليجرام الإدارة
      if (cardImageBuffer) {
        await sendVoucherWithCardImage(
          {
            amount: numericAmount,
            packageName: packageName,
            card: { code: cardCode },
            remaining: "مبتكر تلقائياً",
            phone: phone,
            transactionId: transactionId,
            branch: branchKey,
            branchName: branchDisplayName
          },
          cardImageBuffer
        );
      }

      console.log(`✅ [Webhook SUCCESS Completed] تم معالجة المعاملة: ${transactionId} للكارت: ${cardCode || 'مبلغ مخصص'}`);

    } else {
      obj.phone = phone;
      obj.branch = branchKey;
      obj.branchName = branchDisplayName;
      await sendTelegramMessage(obj, false);
      console.log(`❌ [Webhook FAILED] معاملة فاشلة: ${transactionId}`);
    }

    return res.status(200).send("OK");

  } catch (err) {
    console.error("❌ [Webhook Error] خطأ داخلي في معالجة الإشعار:", err.message);
    return res.status(200).send("Error handled successfully");
  }
});

module.exports = router;
