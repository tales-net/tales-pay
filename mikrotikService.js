const { RouterOSClient } = require("routeros-client");

/**
 * جلب إعدادات السيرفر من متغيرات البيئة ENV بدعم الفروع المتعددة
 */
const BRANCH_ROUTERS = {
  main: {
    host: process.env.MIKROTIK_HOST || "192.168.1.1",
    user: process.env.MIKROTIK_USER || "admin",
    password: process.env.MIKROTIK_PASSWORD || "",
    port: parseInt(process.env.MIKROTIK_PORT || "8728")
  },
  branch2: {
    host: process.env.MIKROTIK_HOST_BRANCH2 || "192.168.2.1",
    user: process.env.MIKROTIK_USER || "admin",
    password: process.env.MIKROTIK_PASSWORD || "",
    port: parseInt(process.env.MIKROTIK_PORT || "8728")
  },
  branch3: {
    host: process.env.MIKROTIK_HOST_BRANCH3 || "192.168.3.1",
    user: process.env.MIKROTIK_USER || "admin",
    password: process.env.MIKROTIK_PASSWORD || "",
    port: parseInt(process.env.MIKROTIK_PORT || "8728")
  }
};

/**
 * تحديد بادئة الكارت، اسم البروفايل، واسم الباقة بناءً على المبلغ المدفوع
 */
function getCardPrefixAndType(amount) {
  const numAmount = Number(amount);
  switch (numAmount) {
    case 5:
      return { prefix: "01", profile: "Bronze", packageName: "الباقة البرونزية", isCustom: false };
    case 15:
      return { prefix: "02", profile: "Silver", packageName: "الباقة الفضية", isCustom: false };
    case 30:
      return { prefix: "05", profile: "Gold", packageName: "الباقة الذهبية", isCustom: false };
    case 50:
      return { prefix: "10", profile: "Platinum", packageName: "الباقة البلاتينية", isCustom: false };
    case 100:
      return { prefix: "25", profile: "Diamond", packageName: "الباقة الماسية", isCustom: false };
    default:
      return { prefix: "", profile: "", packageName: "", isCustom: true };
  }
}

/**
 * توليد كود كارت عشوائي (أرقام فقط) يبدأ بالبادئة المحددة
 */
function generateCardCode(prefix, randomLength = 6) {
  const chars = "0123456789";
  let result = prefix;
  for (let i = 0; i < randomLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * الدالة الرئيسية لمعالجة الدفع وإنشاء الكارت مع ضمان عدم التعارض نهائياً
 */
async function processPaymentAndCreateCard(amount, branchKey = "main", transactionId = "") {
  const cardInfo = getCardPrefixAndType(amount);

  // 1. معالجة المبالغ المختلفة (دعم / هدايا)
  if (cardInfo.isCustom) {
    return {
      success: true,
      isCustomAmount: true,
      amount: amount,
      message: "🌸 بالتوفيق لكم وبارك الله فيكم! نشكركم جزيل الشكر على دعمكم الكريم ونتمنى لكم دائماً كل النجاح والتوفيق ✨",
      notification: {
        title: "تم استلام المساهمة بنجاح ❤️",
        body: `نشكركم جزيل الشكر على دعمكم بقيمة ${amount} ج.م. تقبل الله منكم وزادكم من فضله وتوفيقه!`
      }
    };
  }

  // 2. إعداد الاتصال بالميكروتيك
  const routerConfig = BRANCH_ROUTERS[branchKey] || BRANCH_ROUTERS.main;
  const client = new RouterOSClient({
    host: routerConfig.host,
    user: routerConfig.user,
    password: routerConfig.password,
    port: routerConfig.port,
    timeout: 10
  });

  let cardCode = "";
  let isCreated = false;
  let attempts = 0;
  const maxAttempts = 5; // عدد محاولات توليد رقم جديد في حال حدث تعارض نادر جداً

  try {
    const api = await client.connect();

    // حلقة تكرارية للتأكد من عدم تكرار الكود
    while (!isCreated && attempts < maxAttempts) {
      attempts++;
      cardCode = generateCardCode(cardInfo.prefix);

      try {
        // محاولة إضافة الكارت في User Manager
        await api.menu("/tool/user-manager/user").add({
          username: cardCode,
          password: cardCode,
          customer: "admin",
          comment: `Paymob TXN: ${transactionId} | Amount: ${amount} EGP`
        });

        // تفعيل البروفايل إذا نجحت الإضافة بدون خطأ تكرار
        await api.menu("/tool/user-manager/user").cmd("create-and-activate-profile", {
          user: cardCode,
          profile: cardInfo.profile,
          customer: "admin"
        });

        isCreated = true; // تم الإنشاء بنجاح وبدون تكرار
      } catch (addError) {
        // إذا كان الخطأ بسبب أن اسم المستخدم موجود مسبقاً (تعارض)، سيعيد الحلقة لتوليد رقم جديد تلقائياً
        if (addError.message && addError.message.includes("already exists")) {
          console.warn(`⚠️ الكود ${cardCode} موجود مسبقاً، جاري توليد كود جديد... (محاولة ${attempts})`);
        } else {
          // إذا كان خطأ آخر (مثل انقطاع الاتصال)، أوقف العملية وارم الخطأ
          throw addError;
        }
      }
    }

    await client.close();

    if (!isCreated) {
      throw new Error("فشل توليد كود فريد بعد عدة محاولات بسبب تشبع الأكواد.");
    }

    return {
      success: true,
      isCustomAmount: false,
      cardCode: cardCode,
      amount: amount,
      packageName: cardInfo.packageName,
      profile: cardInfo.profile,
      notification: {
        title: "🎉 تم إصدار الكارت بنجاح!",
        body: `كارت ${cardInfo.packageName} بقيمة ${amount} ج.م هو: (${cardCode}) — اسم المستخدم وكلمة السر متطابقان.`
      }
    };

  } catch (error) {
    console.error(`❌ خطأ في الاتصال بميكروتيك الفرع (${branchKey}):`, error.message);
    if (client) await client.close().catch(() => {});

    return {
      success: false,
      error: "تعذر توليد الكارت تلقائياً من نظام الشبكة. يرجى مراجعة الدعم الفني."
    };
  }
}

module.exports = {
  processPaymentAndCreateCard,
  getCardPrefixAndType
};
