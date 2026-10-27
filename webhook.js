const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { processPaymentAndCreateCard } = require("./mikrotikService");
const { generateCardImage } = require("./cardGenerator");
const { sendTelegramMessage, sendVoucherWithCardImage } = require("./telegram");
const { BRANCH_NAMES } = require("./branches");

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

// ============================================================================
// 🟢 القسم الأول: Paymob Webhook (للمحافظ الإلكترونية وفاليو)
// ============================================================================

router.get("/paymob-webhook", (req, res) => {
  console.log("🔔 [Webhook GET Check] تم استلام طلب GET للتحقق من رابط الويب هوك الخاص بـ Paymob");
  return res.status(200).send("Paymob Webhook Endpoint Active & ready for POST requests.");
});

function verifyPaymobHmac(req) {
  const hmacSecret = process.env.PAYMOB_HMAC;
  if (!hmacSecret) return true;

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
    if (!verifyPaymobHmac(req)) {
      console.error("⛔ [Paymob Webhook Unauthorized] فشل التحقق من HMAC");
      return res.status(401).send("Unauthorized payload HMAC failed");
    }

    const data = req.body;
    const obj = data.obj || data;

    if (!obj || !obj.id) {
      return res.status(200).send("Invalid payload acknowledged");
    }

    const isSuccess = String(obj.success) === "true";
    const transactionId = String(obj.id);
    const orderId = obj.order?.id ? String(obj.order.id) : null;
    const merchantOrderId = obj.order?.merchant_order_id ? String(obj.order.merchant_order_id) : null;

    if (global.generatedCardsMap.has(transactionId)) {
      console.log(`ℹ️ [Paymob Webhook Duplicate] المعاملة ${transactionId} معالجة مسبقاً.`);
      return res.status(200).send("Transaction already processed");
    }

    const amountCents = obj.amount_cents || obj.order?.amount_cents || 0;
    const numericAmount = parseFloat((amountCents / 100).toFixed(2));

    const branchKey = extractBranchKey(obj);
    const branchDisplayName = BRANCH_NAMES[branchKey] || BRANCH_NAMES.main;

    const phone = obj.phone || 
                obj.billing_data?.phone_number || 
                obj.customer?.phone_number || 
                obj.order?.shipping_data?.phone_number || 
                "غير محدد";

    if (isSuccess) {
      console.log(`💳 [Paymob Webhook] معاملة ناجحة: ${transactionId} | الفرع: ${branchDisplayName} (${branchKey}) | المبلغ: ${numericAmount}ج`);

      let packageName = `باقة إنترنت بقيمة ${numericAmount} جنيه`;

      const cardResult = await processPaymentAndCreateCard(numericAmount, branchKey, transactionId);

      let cardImageBuffer = null;
      let cardCode = null;

      if (cardResult.success) {
        if (cardResult.isCustomAmount || cardResult.isContribution) {
          console.log(`🌸 [Contribution/Custom] تم استقبال مساهمة بقيمة ${numericAmount}ج`);
        } else {
          cardCode = cardResult.cardCode;
          packageName = cardResult.packageName || packageName;

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

          global.generatedCardsMap.set(transactionId, cardPayload);
          if (orderId) global.generatedCardsMap.set(orderId, cardPayload);
          if (merchantOrderId) global.generatedCardsMap.set(merchantOrderId, cardPayload);
        }
      }

      obj.voucher_code = cardCode || "⚠️ تعذر الإصدار الآلي";
      obj.package_info = packageName;
      obj.phone = phone;
      obj.branch = branchKey;
      obj.branchName = branchDisplayName;

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

    } else {
      const failureReason = 
        obj.data?.message || 
        obj.data_message || 
        obj.txn_response_code || 
        obj.data?.txn_response_code || 
        "سبب غير محدد من البوابة";

      console.error(`❌ [Paymob Webhook FAILED] معاملة فاشلة: ${transactionId} | السبب: [${failureReason}]`);
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ [Paymob Webhook Error]:", err.message);
    return res.status(200).send("Error handled");
  }
});

// ============================================================================
// 🔵 القسم الثاني: XPay Webhook (لبطاقات الفيزا والماستركارد)
// ============================================================================

router.get("/xpay-webhook", (req, res) => {
  console.log("🔔 [XPay Webhook GET Check] رابط XPay Webhook نشط وجاهز لاستقبال الإشعارات");
  return res.status(200).send("XPay Webhook Endpoint Active & ready for POST requests.");
});

/**
 * 🔒 دالة التحقق من التوقيع الرقمي لـ XPay (يدعم صيغة t=...,v1=... أو التوقيع المباشر)
 */
function verifyXpaySignature(req) {
  const secret = process.env.XPAY_WEBHOOK_SECRET || "whsec_4A8QN65llaJ4aYSdPu19lWD-dovICTki";
  if (!secret) return true;

  const sigHeader = req.headers["xpay-signature"] || req.headers["stripe-signature"] || req.headers["x-signature"] || req.headers["signature"];
  if (!sigHeader) {
    console.warn("⚠️ [XPay Webhook] لم يتم العثور على ترويسة التوقيع، سيتم المتابعة مع فحص البيانات.");
    return true;
  }

  const rawBody = req.rawBody || JSON.stringify(req.body);

  try {
    // في حال كان التوقيع بصيغة: t=1614556800,v1=abcdef...
    if (sigHeader.includes("t=") && sigHeader.includes("v1=")) {
      const parts = sigHeader.split(",");
      const tPart = parts.find(p => p.trim().startsWith("t="));
      const v1Part = parts.find(p => p.trim().startsWith("v1="));
      if (tPart && v1Part) {
        const timestamp = tPart.split("=")[1];
        const signature = v1Part.split("=")[1];
        const signedPayload = `${timestamp}.${rawBody}`;
        const expectedSig = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
        return expectedSig.toLowerCase() === signature.toLowerCase();
      }
    }

    // في حال كان التوقيع HMAC مباشر
    const expectedDirect = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    return expectedDirect.toLowerCase() === sigHeader.toLowerCase();
  } catch (err) {
    console.error("❌ [XPay Signature Verification Error]:", err.message);
    return false;
  }
}

/**
 * استخراج الفرع من حمولة XPay
 */
function extractXpayBranchKey(session) {
  let branchCandidate = 
    session.metadata?.branch || 
    session.shipping_data?.branch || 
    session.custom_fields?.find?.(f => f.field_label === "branch")?.field_value;

  if (branchCandidate && BRANCH_NAMES[branchCandidate]) {
    return branchCandidate;
  }

  const successUrl = String(session.success_url || "");
  if (successUrl.includes("branch=branch2")) return "branch2";
  if (successUrl.includes("branch=branch3")) return "branch3";
  if (successUrl.includes("branch=main")) return "main";

  return "main";
}

router.post("/xpay-webhook", async (req, res) => {
  try {
    if (!verifyXpaySignature(req)) {
      console.error("⛔ [XPay Webhook Unauthorized] فشل التحقق من التوقيع الرقمي لـ XPay");
      return res.status(401).send("Invalid XPay signature");
    }

    const payload = req.body;
    const eventType = payload.type || payload.event || "checkout.session.completed";
    const session = payload.data?.object || payload.data || payload;

    console.log(`🔔 [XPay Webhook] تم استلام حدث: ${eventType}`);

    // التحقق من الأحداث الخاصة بنجاح الدفع
    const isPaidEvent = [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "charge.succeeded",
      "payment_intent.succeeded"
    ].includes(eventType);

    if (isPaidEvent) {
      const paymentStatus = String(session.paymentStatus || session.payment_status || session.status || "paid").toLowerCase();
      
      if (paymentStatus === "unpaid" || paymentStatus === "failed") {
        console.log(`ℹ️ [XPay Webhook] الجلسة لم تُدفع بعد (الحالة: ${paymentStatus})`);
        return res.status(200).send("Acknowledged unpaid status");
      }

      const transactionId = String(session.id || session.transaction_id || session.payment_intent || `XPAY_${Date.now()}`);
      const customOrderId = session.metadata?.custom_order_id || session.client_reference_id || null;

      // حماية ضد التكرار (Idempotency Check)
      if (global.generatedCardsMap.has(transactionId)) {
        console.log(`ℹ️ [XPay Webhook Duplicate] المعاملة ${transactionId} تمت معالجتها مسبقاً.`);
        return res.status(200).send("Already processed");
      }

      // حساب المبلغ بالجنيه المصري بدقة
      let numericAmount = 5;
      if (session.metadata?.amount) {
        numericAmount = parseFloat(session.metadata.amount);
      } else if (session.amount_total || session.amount_cents) {
        numericAmount = parseFloat(((session.amount_total || session.amount_cents) / 100).toFixed(2));
      } else if (session.amount || session.total_amount) {
        const rawAmt = parseFloat(session.amount || session.total_amount);
        numericAmount = rawAmt >= 500 && rawAmt % 100 === 0 ? rawAmt / 100 : rawAmt;
      }

      const branchKey = extractXpayBranchKey(session);
      const branchDisplayName = BRANCH_NAMES[branchKey] || BRANCH_NAMES.main;

      const phone = 
        session.metadata?.phone || 
        session.customer_details?.phone || 
        session.customer_phone || 
        session.user?.mobile || 
        "غير محدد";

      console.log(`💳 [XPay Webhook Success] بطاقة ناجحة: ${transactionId} | الفرع: ${branchDisplayName} (${branchKey}) | المبلغ: ${numericAmount}ج`);

      let packageName = `باقة إنترنت بقيمة ${numericAmount} جنيه`;

      // 🚀 إصدار الكارت من راوتر الميكروتيك للفرع المحدد
      const cardResult = await processPaymentAndCreateCard(numericAmount, branchKey, transactionId);

      let cardImageBuffer = null;
      let cardCode = null;

      if (cardResult.success) {
        if (cardResult.isCustomAmount || cardResult.isContribution) {
          console.log(`🌸 [XPay Contribution] تم استقبال مساهمة بقيمة ${numericAmount}ج`);
        } else {
          cardCode = cardResult.cardCode;
          packageName = cardResult.packageName || packageName;

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

          global.generatedCardsMap.set(transactionId, cardPayload);
          if (customOrderId) global.generatedCardsMap.set(String(customOrderId), cardPayload);
        }
      } else {
        console.error(`🚨 [XPay Webhook Error] فشل إنشاء الكارت للمبلغ ${numericAmount}ج:`, cardResult.error);
      }

      const telegramObj = {
        id: transactionId,
        transactionId: transactionId,
        amount: numericAmount,
        payment_method: "card",
        voucher_code: cardCode || "⚠️ تعذر الإصدار الآلي",
        package_info: packageName,
        phone: phone,
        branch: branchKey,
        branchName: branchDisplayName
      };

      await sendTelegramMessage(telegramObj, false);

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

      console.log(`✅ [XPay Webhook Completed] تم إتمام معاملة البطاقة وتوليد الكارت: ${transactionId}`);
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ [XPay Webhook Error]:", err.message);
    return res.status(200).send("Error handled");
  }
});

module.exports = router;
