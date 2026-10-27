const express = require("express");
const crypto = require("crypto");
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

router.get("/paymob-webhook", (req, res) => {
  return res.status(200).send("Paymob Webhook Endpoint Active");
});

function verifyPaymobHmac(req) {
  const hmacSecret = process.env.PAYMOB_HMAC;
  if (!hmacSecret) return true;

  const receivedHmac = req.query.hmac;
  if (!receivedHmac) return false;

  const obj = req.body.obj || req.body;
  if (!obj) return false;

  const lexicalKeys = [
    "amount_cents", "created_at", "currency", "error_occured",
    "has_parent_transaction", "id", "integration_id", "is_3d_secure",
    "is_auth", "is_capture", "is_refunded", "is_standalone_payment",
    "is_voided", "order.id", "owner", "pending", "source_data.pan",
    "source_data.sub_type", "source_data.type", "success"
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
      return res.status(401).send("Unauthorized");
    }

    const data = req.body;
    const obj = data.obj || data;

    if (!obj || !obj.id) {
      return res.status(200).send("OK");
    }

    const isSuccess = String(obj.success) === "true";
    const transactionId = String(obj.id);
    const orderId = obj.order?.id ? String(obj.order.id) : null;
    const merchantOrderId = obj.order?.merchant_order_id ? String(obj.order.merchant_order_id) : null;

    if (global.generatedCardsMap.has(transactionId)) {
      return res.status(200).send("Processed");
    }

    const amountCents = obj.amount_cents || obj.order?.amount_cents || 0;
    const numericAmount = parseFloat((amountCents / 100).toFixed(2));
    const branchKey = extractBranchKey(obj);
    const branchDisplayName = BRANCH_NAMES[branchKey] || BRANCH_NAMES.main;
    const phone = obj.phone || obj.billing_data?.phone_number || obj.customer?.phone_number || "غير محدد";

    if (isSuccess) {
      let packageName = `باقة إنترنت بقيمة ${numericAmount} جنيه`;
      const cardResult = await processPaymentAndCreateCard(numericAmount, branchKey, transactionId);

      let cardImageBuffer = null;
      let cardCode = null;

      if (cardResult.success && !cardResult.isCustomAmount && !cardResult.isContribution) {
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

      obj.voucher_code = cardCode || "⚠️ تعذر الإصدار الآلي";
      obj.package_info = packageName;
      obj.phone = phone;
      obj.branch = branchKey;
      obj.branchName = branchDisplayName;

      await sendTelegramMessage(obj, false);

      if (cardImageBuffer) {
        await sendVoucherWithCardImage({
          amount: numericAmount,
          packageName: packageName,
          card: { code: cardCode },
          remaining: "مبتكر تلقائياً",
          phone: phone,
          transactionId: transactionId,
          branch: branchKey,
          branchName: branchDisplayName
        }, cardImageBuffer);
      }
    }

    return res.status(200).send("OK");
  } catch (err) {
    return res.status(200).send("Error handled");
  }
});

router.get("/xpay-webhook", (req, res) => {
  return res.status(200).send("XPay Webhook Active");
});

function verifyXpaySignature(req) {
  const secret = process.env.XPAY_WEBHOOK_SECRET || "whsec_4A8QN65llaJ4aYSdPu19lWD-dovICTki";
  if (!secret) return true;

  const sigHeader = req.headers["xpay-signature"] || req.headers["stripe-signature"] || req.headers["x-signature"] || req.headers["signature"];
  if (!sigHeader) return true;

  const rawBody = req.rawBody || JSON.stringify(req.body);

  try {
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

    const expectedDirect = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    return expectedDirect.toLowerCase() === sigHeader.toLowerCase();
  } catch (err) {
    return false;
  }
}

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
      return res.status(401).send("Invalid signature");
    }

    const payload = req.body;
    const eventType = payload.type || payload.event || "checkout.session.completed";
    const session = payload.data?.object || payload.data || payload;

    const isPaidEvent = [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "charge.succeeded",
      "payment_intent.succeeded"
    ].includes(eventType);

    if (isPaidEvent) {
      const paymentStatus = String(session.paymentStatus || session.payment_status || session.status || "paid").toLowerCase();
      if (paymentStatus === "unpaid" || paymentStatus === "failed") {
        return res.status(200).send("OK");
      }

      const transactionId = String(session.id || session.transaction_id || session.payment_intent || `XPAY_${Date.now()}`);
      const customOrderId = session.metadata?.custom_order_id || session.client_reference_id || null;

      if (global.generatedCardsMap.has(transactionId)) {
        return res.status(200).send("Processed");
      }

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
      const phone = session.metadata?.phone || session.customer_details?.phone || session.customer_phone || "غير محدد";

      const cardResult = await processPaymentAndCreateCard(numericAmount, branchKey, transactionId);

      let cardImageBuffer = null;
      let cardCode = null;

      if (cardResult.success && !cardResult.isCustomAmount && !cardResult.isContribution) {
        cardCode = cardResult.cardCode;
        let packageName = cardResult.packageName || `باقة إنترنت بقيمة ${numericAmount} جنيه`;

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

        const telegramObj = {
          id: transactionId,
          transactionId: transactionId,
          amount: numericAmount,
          payment_method: "card",
          voucher_code: cardCode,
          package_info: packageName,
          phone: phone,
          branch: branchKey,
          branchName: branchDisplayName
        };

        await sendTelegramMessage(telegramObj, false);

        if (cardImageBuffer) {
          await sendVoucherWithCardImage({
            amount: numericAmount,
            packageName: packageName,
            card: { code: cardCode },
            remaining: "مبتكر تلقائياً",
            phone: phone,
            transactionId: transactionId,
            branch: branchKey,
            branchName: branchDisplayName
          }, cardImageBuffer);
        }
      }
    }

    return res.status(200).send("OK");
  } catch (err) {
    return res.status(200).send("Error handled");
  }
});

module.exports = router;
