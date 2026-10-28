const express = require("express");
const crypto = require("node:crypto");
const router = express.Router();
const { processPaymentAndCreateCard } = require("./mikrotikService");
const { generateCardImage } = require("./cardGenerator");
const { sendTelegramMessage, sendVoucherWithCardImage } = require("./telegram");

const { BRANCH_NAMES } = require("./branches");

global.generatedCardsMap = global.generatedCardsMap || new Map();

setInterval(() => {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.now();
  for (const [key, value] of global.generatedCardsMap.entries()) {
    if (value.createdAt && (now - new Date(value.createdAt).getTime() > ONE_HOUR)) {
      global.generatedCardsMap.delete(key);
    }
  }
}, 15 * 60 * 1000);

// ==========================================
// 1. Paymob Webhook & HMAC Verification
// ==========================================

router.get("/paymob-webhook", (req, res) => {
  console.log("🔔 [Webhook GET Check] تم استلام طلب GET للتحقق من رابط الويب هوك");
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
      console.error("⛔ [Webhook Unauthorized] فشل التحقق من HMAC إشارة غير موثوقة");
      return res.status(401).send("Unauthorized payload HMAC failed");
    }

    const data = req.body;
    const obj = data.obj || data;

    if (!obj || !obj.id) {
      console.error("⚠️ [Webhook] استلام حمولة فارغة أو غير صالحة");
      return res.status(200).send("Invalid payload acknowledged");
    }

    const isSuccess = String(obj.success) === "true";
    const transactionId = String(obj.id);
    const orderId = obj.order?.id ? String(obj.order.id) : null;
    const merchantOrderId = obj.order?.merchant_order_id ? String(obj.order.merchant_order_id) : null;

    if (global.generatedCardsMap.has(transactionId)) {
      console.log(`ℹ️ [Webhook Duplicate] المعاملة ${transactionId} معالجة بالفعل سلفاً.`);
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
        if (cardResult.isCustomAmount) {
          console.log(`🌸 [Custom Amount] تم استقبال مساهمة بقيمة ${numericAmount}ج`);
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
      } else {
        console.error(`🚨 [Paymob Webhook Error] فشل إنشاء الكارت للمبلغ ${numericAmount}ج:`, cardResult.error);
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

      console.log(`✅ [Paymob Webhook SUCCESS] تم معالجة المعاملة: ${transactionId}`);

    } else {
      const failureReason = 
        obj.data?.message || 
        obj.data_message || 
        obj.txn_response_code || 
        obj.data?.txn_response_code || 
        "سبب غير محدد من البوابة";

      console.error(`❌ [Paymob Webhook FAILED] معاملة فاشلة: ${transactionId} | السبب: [${failureReason}]`);

      obj.phone = phone;
      obj.branch = branchKey;
      obj.branchName = branchDisplayName;
      obj.failure_reason = failureReason;

      await sendTelegramMessage(obj, false);
    }

    return res.status(200).send("OK");

  } catch (err) {
    console.error("❌ [Paymob Webhook Error]:", err.message);
    return res.status(200).send("Error handled successfully");
  }
});


// ==========================================
// 2. XPay Webhook & Signature Verification
// ==========================================

const TOLERANCE_SECONDS = 300;

function verifyXPaySignature(rawBody, header, secret) {
  if (!header || !secret) return { valid: false };
  try {
    const parts = Object.fromEntries(
      header.split(",").map((p) => {
        const [k, ...rest] = p.split("=");
        return [k, rest.join("=")];
      })
    );
    const timestamp = Number.parseInt(parts.t ?? "", 10);
    const received = parts.v1;
    if (!Number.isFinite(timestamp) || !received) return { valid: false };

    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > TOLERANCE_SECONDS) {
      return { valid: false };
    }

    const computed = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    const a = Buffer.from(computed);
    const b = Buffer.from(received);
    if (a.length !== b.length) return { valid: false };
    if (!crypto.timingSafeEqual(a, b)) return { valid: false };

    return { valid: true, event: JSON.parse(rawBody) };
  } catch (e) {
    return { valid: false };
  }
}

global.processedXPayEvents = global.processedXPayEvents || new Set();

router.post("/xpay-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const rawBody = req.body.toString("utf8");
    const signatureHeader = req.header("XPay-Signature");
    const webhookSecret = process.env.XPAY_WEBHOOK_SECRET;

    const verification = verifyXPaySignature(rawBody, signatureHeader, webhookSecret);
    if (!verification.valid) {
      console.error("⛔ [XPay Webhook] فشل التحقق من التوقيع الرقمي (Invalid Signature)");
      return res.status(400).send("Invalid signature");
    }

    const event = verification.event;
    const eventId = event.id;

    if (global.processedXPayEvents.has(eventId)) {
      console.log(`ℹ️ [XPay Webhook Duplicate] الحدث ${eventId} معالج بالفعل مسبقاً.`);
      return res.status(200).send("Event already processed");
    }
    global.processedXPayEvents.add(eventId);

    if (global.processedXPayEvents.size > 10000) {
      global.processedXPayEvents.clear();
    }

    const session = event.data?.object || {};
    const paymentStatus = session.paymentStatus || session.payment_status;
    const amount = parseFloat(session.amount_total || session.amount || 5);
    const transactionId = session.id || session.payment_intent || `X_${Date.now()}`;
    const branchKey = session.merchant_extra?.branch || session.branch || "main";
    const phone = session.customer_details?.phone || session.phone || "غير محدد";

    console.log(`🔔 [XPay Event] النوع: ${event.type} | الحالة: ${paymentStatus} | المبلغ: ${amount}ج | الفرع: ${branchKey}`);

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      if (paymentStatus === "paid") {
        console.log(`✅ [XPay Success] الدفع مؤكد للمعاملة: ${transactionId}`);

        const cardResult = await processPaymentAndCreateCard(amount, branchKey, transactionId);

        if (cardResult.success) {
          if (cardResult.isCustomAmount) {
            global.generatedCardsMap.set(transactionId, {
              isContribution: true,
              amount: amount,
              transactionId: transactionId,
              branchKey: branchKey,
              createdAt: new Date()
            });
            console.log(`🌸 [XPay المساهمات] تم تسجيل مساهمة بقيمة ${amount}ج`);
          } else {
            global.generatedCardsMap.set(transactionId, {
              code: cardResult.cardCode,
              packageName: cardResult.packageName,
              amount: amount,
              phone: phone,
              branchKey: branchKey,
              branchName: BRANCH_NAMES[branchKey] || BRANCH_NAMES.main,
              createdAt: new Date()
            });
            console.log(`🎟️ [XPay كارت] تم توليد الكارت بنجاح: ${cardResult.cardCode}`);
          }
        }
      } else {
        console.log(`⏳ [XPay Pending] الجلسة بانتظار الدفع: ${transactionId}`);
      }
    } else if (event.type === "checkout.session.async_payment_failed") {
      console.error(`❌ [XPay Failed] فشل الدفع المؤجل للمعاملة: ${transactionId}`);
    }

    return res.status(200).send("Webhook Handled Successfully");

  } catch (err) {
    console.error("❌ [XPay Webhook Error]:", err.message);
    return res.status(500).send("Internal Server Error");
  }
});

// للتحقق من أن رابط الويب هوك نشط عند فتحه بالمتصفح
router.get("/xpay-webhook", (req, res) => {
  return res.status(200).send("XPay Webhook Endpoint Active & ready for POST requests.");
});

module.exports = router;
