const { createCardOnly } = require("./mikrotikCardService");
const { activateCardProfile } = require("./mikrotikProfileService");

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

  const targetBranch = BRANCH_ROUTERS[branchKey] ? branchKey : "main";
  const routerConfig = BRANCH_ROUTERS[targetBranch];

  try {
    // 1. استدعاء ملف إضافة الكارت فقط
    const cardCode = await createCardOnly(routerConfig, cardInfo.prefix, transactionId);

    // 2. استدعاء ملف تفعيل الباقة بعد الانتظار 10 ثوانٍ
    await activateCardProfile(routerConfig, cardCode, cardInfo.profile, 10);

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
    return {
      success: false,
      error: `تعذر توليد الكارت وتفعيل الباقة: ${error.message}`
    };
  }
}

module.exports = {
  processPaymentAndCreateCard,
  getCardPrefixAndType,
  BRANCH_ROUTERS
};
