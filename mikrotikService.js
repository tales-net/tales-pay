const { createCardOnly } = require("./mikrotikCardService");
const { activateCardProfileViaScript } = require("./mikrotikProfileService");

// 🌐 تعريف الفروع وربطها بمتغيرات البيئة في Render بدقة
const BRANCH_ROUTERS = {
  main: {
    host: process.env.MIKROTIK_HOST || "192.168.1.1",
    user: process.env.MIKROTIK_USER || "admin",
    password: process.env.MIKROTIK_PASSWORD || "",
    port: parseInt(process.env.MIKROTIK_PORT || "8728")
  },
  branch2: {
    host: process.env.MIKROTIK_HOST_BRANCH2 || process.env.MIKROTIK_HOST || "192.168.2.1",
    user: process.env.MIKROTIK_USER || "admin",
    password: process.env.MIKROTIK_PASSWORD || "",
    port: parseInt(process.env.MIKROTIK_PORT || "8728")
  },
  branch3: {
    host: process.env.MIKROTIK_HOST_BRANCH3 || process.env.MIKROTIK_HOST || "192.168.3.1",
    user: process.env.MIKROTIK_USER || "admin",
    password: process.env.MIKROTIK_PASSWORD || "",
    port: parseInt(process.env.MIKROTIK_PORT || "8728")
  }
};

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

async function processPaymentAndCreateCard(amount, branchKey = "main", transactionId = "") {
  const cardInfo = getCardPrefixAndType(amount);

  if (cardInfo.isCustom) {
    return {
      success: true,
      isCustomAmount: true,
      amount: amount,
      message: "🌸 بالتوفيق لكم وبارك الله فيكم!"
    };
  }

  // التأكد من اختيار الفرع الصحيح أو الرجوع للرئيسي
  const targetBranch = BRANCH_ROUTERS[branchKey] ? branchKey : "main";
  const routerConfig = BRANCH_ROUTERS[targetBranch];

  console.log(`🌐 [Mikrotik Service] جاري إرسال طلب الكارت إلى الفرع: [${targetBranch}] على العنوان: ${routerConfig.host}:${routerConfig.port}`);

  try {
    // 1. إنشاء الكارت في الميكروتيك
    const cardCode = await createCardOnly(routerConfig, cardInfo.prefix, transactionId);

    // 2. تفعيل البروفايل عبر السكريبت
    await activateCardProfileViaScript(routerConfig, cardCode, cardInfo.profile, 10);

    return {
      success: true,
      isCustomAmount: false,
      cardCode: cardCode,
      amount: amount,
      packageName: cardInfo.packageName,
      profile: cardInfo.profile,
      branchKey: targetBranch
    };

  } catch (error) {
    console.error(`❌ خطأ في معالجة الميكروتيك للفرع ${targetBranch} (${routerConfig.host}):`, error.message);
    throw new Error(`تعذر توليد الكارت وتفعيل الباقة (${targetBranch}): ${error.message}`);
  }
}

module.exports = {
  processPaymentAndCreateCard,
  getCardPrefixAndType,
  BRANCH_ROUTERS
};
