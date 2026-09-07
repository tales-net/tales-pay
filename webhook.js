const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const profiles = require("./profiles");
const { processPaymentAndCreateCard } = require("./mikrotikService");
const { generateCardImage } = require("./cardGenerator");
const { sendTelegramMessage, sendVoucherWithCardImage } = require("./telegram");

// خريطة عالمية لحفظ بيانات وكروت المعاملات مؤقتاً لصفحة النجاح
global.generatedCardsMap = global.generatedCardsMap || new Map();

// 🧹 تنظيف الذاكرة المؤقتة كل 15 دقيقة
setInterval(() => {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.now();
  for (const [key, value] of global.generatedCardsMap.entries()) {
    if (value.createdAt && (now - new Date(value.createdAt).getTime() > ONE_HOUR)) {
      global.generatedCardsMap.delete(key);
    }
  }
}, 15 * 60 * 1000);

const BRANCH_NAMES = {
  main: "حكايات نت رئيسي",
  branch2: "حكايات نت فرع ثاني",
  branch3: "حكايات نت فرع ثالث"
};

// 🔄 معالجة طلبات GET لـ Paymob
router.get("/paymob-webhook", (req, res) => {
  console.log("🔔 [Webhook GET Check] تم استلام طلب GET للتحقق من رابط الويب هوك");
  return res.status(200).send("Paymob Webhook Endpoint Active & ready for POST requests.");
});

/**
 * 🔒 دالة التحقق من التوقيع الرقمي HMAC القادم من Paymob
 */
function verifyPaymobHmac(req) {
  const hmacSecret = process.env.PAYMOB_HMAC;
  if (!hmacSecret) return true; // تجاوز الفحص إذا لم يتم ضبط المتغير في البيئة

  const receivedHmac = req.query.hmac;
  if (!receivedHmac) return false;

  const obj = req.body.obj || req.body;
  if (!obj) return false;

  const lexicalKeys = [
    "amount_cents",
    "created_at",
    "currency",
    "error_occured",
    "has_parent_transaction",
    "id",
    "integration_id",
    "is_3d_secure",
    "is_auth",
    "is_capture",
    "is_refunded",
    "is_standalone_payment",
    "is_voided",
    "order.id",
    "owner",
    "pending",
    "source_data.pan",
    "source_data.sub_type",
    "source_data.type",
    "success"
  ];

  let concatenatedValues = "";
  for (const key of lexicalKeys) {
    let val = "";
    if (key.includes(".")) {
      const parts = key.split(".");
      val = obj[parts[0]] ? obj[parts[0]][parts[1]] : "";
    } else {
      val = obj[key];
    }
    
    if (val === undefined || val === null) {
      val = "";
    } else if (typeof val === "boolean") {
      val = val ? "true" : "false";
    }
    
    concatenatedValues += String(val);
  }

  const calculatedHmac = crypto
    .createHmac("sha512", hmacSecret)
    .update(concatenatedValues)
    .digest("hex");

  return calculatedHmac.toLowerCase() === receivedHmac.toLowerCase();
}

/**
 * استخراج الفرع من حمولة Paymob
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
    // 1. التحقق من التوقيع الرقمي HMAC لمنع أي طلبات مزيفة أو وهمية
    if (!verifyPaymobHmac(req)) {
      console.error("⛔ [Webhook Unauthorized] فشل التحقق من HMAC إشارة غير موثوقة أو وهمية");
      return res.status(401).send("Unauthorized payload HMAC failed");
    }

    const data = req.body;
    const obj = data.obj || data;

    // 2. التحقق الصارم من وجود المعرفات الحقيقية للعملية
    if (!obj || !obj.id || !obj.order || !obj.order.id) {
      console.error("⚠️ [Webhook] تم تجاهل حمولة ناقصة أو تحتوي على رقم عملية وهمي/غير مكتمل");
      return res.status(200).send("Invalid or dummy payload ignored");
    }

    const isSuccess = String(obj.success) === "true";
    const transactionId = String(obj.id);
    const orderId = String(obj.order.id);
    const merchantOrderId = obj.order.merchant_order_id ? String(obj.order.merchant_order_id) : `TALES-ORD-${orderId}`;

    // 3. حماية ضد تكرار المعالجة (Idempotency Check)
    if (global.generatedCardsMap.has(transactionId)) {
      console.log(`ℹ️ [Webhook Duplicate] المعاملة ${transactionId} معالجة مسبقاً.`);
      return res.status(200).send("Transaction already processed");
    }

    const amountCents = obj.amount_cents || obj.order?.amount_cents || 0;
    const numericAmount = parseFloat((amountCents / 100).toFixed(2));

    // منع المعاملات ذات المبلغ الصفري أو الوهمي تماماً من إرسال تنبيهات
    if (numericAmount <= 0) {
      console.warn(`⚠️ [Webhook Warning] تم رصد معاملة بمبلغ غير صالح (${numericAmount}): تم التجاهل.`);
      return res.status(200).send("Invalid amount ignored");
    }

    const branchKey = extractBranchKey(obj);
    const branchDisplayName = BRANCH_NAMES[branchKey] || BRANCH_NAMES.main;

    const phone = obj.phone || 
                obj.billing_data?.phone_number || 
                obj.customer?.phone_number || 
                obj.order?.shipping_data?.phone_number || 
                "غير محدد";

    if (isSuccess) {
      console.log(`💳 [Webhook SUCCESS] معاملة حقيقية ناجحة: ${transactionId} | الفرع: ${branchDisplayName} | المبلغ: ${numericAmount}ج`);

      let packageName = "باقة إنترنت شبكة حكايات";
      if (typeof profiles.getPackageName === "function") {
        packageName = profiles.getPackageName(numericAmount);
      } else if (typeof profiles === "function") {
        packageName = profiles(numericAmount);
      } else if (typeof profiles === "object" && profiles !== null) {
        packageName = profiles[numericAmount] || profiles[String(numericAmount)] || "باقة إنترنت شبكة حكايات";
      }

      // 🚀 توليد الكارت الحقيقي تلقائياً في راوتر الميكروتيك برقم المعاملة الفعلي
      const cardResult = await processPaymentAndCreateCard(numericAmount, branchKey, transactionId);

      let cardImageBuffer = null;
      let cardCode = null;

      if (cardResult.success) {
        if (cardResult.isCustomAmount) {
          console.log(`🌸 [Custom Amount] تم استقبال مساهمة حقيقية بقيمة ${numericAmount}ج`);
        } else {
          cardCode = cardResult.cardCode;
          packageName = cardResult.packageName || packageName;

          // توليد صورة الكارت
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

          // حفظ البيانات بالمعرفات الحقيقية فقط
          global.generatedCardsMap.set(transactionId, cardPayload);
          global.generatedCardsMap.set(orderId, cardPayload);
          global.generatedCardsMap.set(merchantOrderId, cardPayload);
        }
      } else {
        console.error(`🚨 [Webhook Error] فشل إنشاء الكارت للمبلغ ${numericAmount}ج:`, cardResult.error);
      }

      obj.voucher_code = cardCode || "⚠️ تعذر الإصدار الآلي";
      obj.package_info = packageName;
      obj.phone = phone;
      obj.branch = branchKey;
      obj.branchName = branchDisplayName;

      // إرسال الإشعار للتليجرام بالمعرفات الحقيقية الموثوقة فقط
      await sendTelegramMessage(obj, false);

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

      console.log(`✅ [Webhook Completed] تم إنهاء معالجة المعاملة الحقيقية بنجاح: ${transactionId}`);

    } else {
      // المعاملات الفاشلة أو الوهمية التي تم رفضها من البوابة
      const failureReason = 
        obj.data?.message || 
        obj.data_message || 
        obj.txn_response_code || 
        obj.data?.txn_response_code || 
        "سبب غير محدد من البوابة";

      console.error(`❌ [Webhook FAILED] معاملة مرفوضة أو فاشلة: ${transactionId} | السبب: [${failureReason}]`);

      obj.phone = phone;
      obj.branch = branchKey;
      obj.branchName = branchDisplayName;
      obj.failure_reason = failureReason;

      // تنبيه الإدارة بالفشل لكي لا تظل معلقة
      await sendTelegramMessage(obj, false);
    }

    return res.status(200).send("OK");

  } catch (err) {
    console.error("❌ [Webhook Error] خطأ داخلي في معالجة الإشعار:", err.message);
    return res.status(200).send("Error handled successfully");
  }
});

module.exports = router;
