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
 * الدالة الرئيسية لمعالجة الدفع وإنشاء الكارت وتفعيله منفصلاً حسب الفرع المختار
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

  // 2. اختيار الفرع المستهدف بدقة وضبط الاتصال
  const targetBranch = BRANCH_ROUTERS[branchKey] ? branchKey : "main";
  const routerConfig = BRANCH_ROUTERS[targetBranch];

  console.log(`🌐 [MikroTik Router] جاري الاتصال بالفرع: [ ${targetBranch.toUpperCase()} ] على العنوان: ${routerConfig.host}`);

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
  const maxAttempts = 5; // عدد محاولات توليد رقم فريد جديد في حال حدث تعارض مسبقاً

  try {
    const api = await client.connect();

    // حلقة تكرارية لضمان توليد كود غير مكرر داخل الفرع
    while (!isCreated && attempts < maxAttempts) {
      attempts++;
      cardCode = generateCardCode(cardInfo.prefix);

      try {
        // الخطوة الأولى: إضافة المستخدم بشكل منفصل تماماً
        console.log(`👤 [User-Manager] (${targetBranch}) جاري إضافة المستخدم: ${cardCode}`);
        await api.menu("/tool/user-manager/user").add({
          username: cardCode,
          password: cardCode,
          customer: "admin",
          comment: `Branch: ${targetBranch} | Paymob TXN: ${transactionId} | Amount: ${amount} EGP`
        });

        // الخطوة الثانية: تفعيل البروفايل للمستخدم بشكل منفصل تماماً بعد الإضافة الناجحة
        console.log(`📦 [User-Manager] (${targetBranch}) تفعيل البروفايل "${cardInfo.profile}" للمستخدم: ${cardCode}`);
        await api.menu("/tool/user-manager/user").cmd("create-and-activate-profile", {
          user: cardCode,
          profile: cardInfo.profile,
          customer: "admin"
        });

        isCreated = true; // تم إنشاء الكارت وتفعيله بنجاح تام
      } catch (addError) {
        // إذا كان الخطأ بسبب تكرار اسم المستخدم، نقوم بإعادة المحاولة برقم جديد
        if (addError.message && (addError.message.includes("already exists") || addError.message.includes("already"))) {
          console.warn(`⚠️ [${targetBranch}] الكود ${cardCode} موجود مسبقاً، جاري توليد كود بديل... (محاولة ${attempts})`);
        } else {
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
      branchKey: targetBranch,
      notification: {
        title: "🎉 تم إصدار الكارت بنجاح!",
        body: `كارت ${cardInfo.packageName} لفرع (${targetBranch}) بقيمة ${amount} ج.م هو: (${cardCode}) — اسم المستخدم وكلمة السر متطابقان.`
      }
    };

  } catch (error) {
    console.error(`❌ خطأ في الاتصال أو تنفيذ الأوامر بميكروتيك الفرع (${targetBranch}):`, error.message);
    if (client) await client.close().catch(() => {});

    return {
      success: false,
      error: `تعذر توليد الكارت تلقائياً من نظام شبكة (${targetBranch}). يرجى مراجعة الدعم الفني.`
    };
  }
}

module.exports = {
  processPaymentAndCreateCard,
  getCardPrefixAndType,
  BRANCH_ROUTERS
};
