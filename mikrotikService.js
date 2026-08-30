const { createCardOnly } = require("./mikrotikCardService");
const { activateCardProfileViaScript } = require("./mikrotikProfileService");

// خريطة إعدادات الميكروتيك لكل فرع
const BRANCH_ROUTERS = {
  main: {
    host: process.env.MIKROTIK_HOST || process.env.MIKROTIK_HOST_MAIN,
    user: process.env.MIKROTIK_USER || process.env.MIKROTIK_USER_MAIN || "admin",
    password: process.env.MIKROTIK_PASSWORD || process.env.MIKROTIK_PASSWORD_MAIN || "",
    port: parseInt(process.env.MIKROTIK_PORT || process.env.MIKROTIK_PORT_MAIN || "8728")
  },
  branch2: {
    host: process.env.MIKROTIK_HOST_BRANCH2,
    user: process.env.MIKROTIK_USER_BRANCH2 || "admin",
    password: process.env.MIKROTIK_PASSWORD_BRANCH2 || "",
    port: parseInt(process.env.MIKROTIK_PORT_BRANCH2 || "8728")
  },
  branch3: {
    host: process.env.MIKROTIK_HOST_BRANCH3,
    user: process.env.MIKROTIK_USER_BRANCH3 || "admin",
    password: process.env.MIKROTIK_PASSWORD_BRANCH3 || "",
    port: parseInt(process.env.MIKROTIK_PORT_BRANCH3 || "8728")
  }
};

function getCardPrefixAndType(amount) {
  const cleanAmount = parseFloat(amount);
  if (cleanAmount === 5 || cleanAmount === 10) {
    return { prefix: "5LE", packageName: "باقة 5 جنيه - شبكة حكايات", profile: "Profile_5LE" };
  } else if (cleanAmount === 15 || cleanAmount === 20) {
    return { prefix: "15LE", packageName: "باقة 15 جنيه - شبكة حكايات", profile: "Profile_15LE" };
  } else if (cleanAmount === 30 || cleanAmount === 50) {
    return { prefix: "30LE", packageName: "باقة 30 جنيه - شبكة حكايات", profile: "Profile_30LE" };
  }
  return { prefix: "GEN", packageName: `باقة إنترنت (${cleanAmount} جنيه)`, profile: "Default_Profile" };
}

async function processPaymentAndCreateCard(amount, branchKey = "main", txId = "") {
  const selectedBranch = BRANCH_ROUTERS[branchKey] ? branchKey : "main";
  const routerConfig = BRANCH_ROUTERS[selectedBranch];

  console.log(`🌐 [MikroTik Router] جاري الاتصال بفرع [${selectedBranch}] على العنوان: ${routerConfig.host}:${routerConfig.port}`);

  if (!routerConfig.host) {
    throw new Error(`عنوان الـ IP أو الدومين الخاص بالفرع (${selectedBranch}) غير معرّف في متغيرات البيئة (.env)!`);
  }

  const { prefix, packageName, profile } = getCardPrefixAndType(amount);

  try {
    // 1. توليد كود الكارت وإضافته للميكروتيك
    const cardResult = await createCardOnly(routerConfig, prefix);
    if (!cardResult || !cardResult.success) {
      throw new Error(cardResult?.error || "فشل توليد الكود من سيرفر الميكروتيك");
    }

    const cardCode = cardResult.code;

    // 2. تفعيل البروفايل أو الـ User-Manager للرقم المولد
    await activateCardProfileViaScript(routerConfig, cardCode, profile);

    console.log(`✅ [SUCCESS] تم إنشاء الكارت وتفعيله بنجاح لفرع (${selectedBranch}) برقم: ${cardCode}`);

    return {
      success: true,
      branchKey: selectedBranch,
      cardCode: cardCode,
      packageName: packageName,
      amount: amount,
      txId: txId
    };
  } catch (error) {
    console.error(`❌ [MikroTik Error - ${selectedBranch}]:`, error.message);
    throw new Error(`فشل الاتصال براوتر فرع (${selectedBranch}): ${error.message}`);
  }
}

module.exports = {
  processPaymentAndCreateCard,
  BRANCH_ROUTERS
};
