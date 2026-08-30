const { createCardOnly } = require("./mikrotikCardService");
const { activateCardProfileViaScript } = require("./mikrotikProfileService");

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
      return { prefix: "01", profileId: "4", packageName: "الباقة البرونزية", isCustom: false };   // Bronze ID = 4
    case 15:
      return { prefix: "02", profileId: "5", packageName: "الباقة الفضية", isCustom: false };    // Silver ID = 5
    case 30:
      return { prefix: "05", profileId: "6", packageName: "الباقة الذهبية", isCustom: false };    // Gold ID = 6
    case 50:
      return { prefix: "10", profileId: "7", packageName: "الباقة البلاتينية", isCustom: false }; // Platinum ID = 7
    case 100:
      return { prefix: "25", profileId: "8", packageName: "الباقة الماسية", isCustom: false };   // Diamond ID = 8
    default:
      return { prefix: "", profileId: "", packageName: "", isCustom: true };
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
    console.log(`--- [1/2] بدء عملية إنشاء الكارت النظيف للفرع: ${targetBranch} ---`);
    
    // الخطوة الأولى: إنشاء الكارت النظيف حصرياً والتأكد من عدم وجود تشابه
    const cardCode = await createCardOnly(routerConfig, cardInfo.prefix, transactionId);
    console.log(`✅ تم إنشاء الكارت النظيف بنجاح برقم: ${cardCode}`);

    console.log(`--- [2/2] بدء تفعيل البروفايل (${cardInfo.profile}) على الكارت الجديد ---`);
    
    // الخطوة الثانية: إضافة الباقة والبروفايل على الكارت الذي تم إنشاؤه نظيفاً
    await activateCardProfileViaScript(routerConfig, cardCode, cardInfo.profile, 5);

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
    console.error(`❌ خطأ في عملية معالجة الدفع وإنشاء الكارت: ${error.message}`);
    return {
      success: false,
      error: `تعذر توليد الكارت وتفعيل الباقة: ${error.message}`
    };
  }
}

module.exports = {
  processPaymentAndCreateCard,
  getCardPrefixAndType,
  BRANCH_ROTRUS: BRANCH_ROUTERS
};
