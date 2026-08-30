const { createCardOnly } = require("./mikrotikCardService");
const { activateCardProfileViaScript } = require("./mikrotikProfileService");

// 🌐 تعريف الفروع ببيانات مستقلة تماماً وموحدة في البورت والباسورد واليوزر
const BRANCH_ROUTERS = {
  main: {
    host: process.env.MIKROTIK_HOST,
    user: process.env.MIKROTIK_USER,
    password: process.env.MIKROTIK_PASSWORD,
    port: parseInt(process.env.MIKROTIK_PORT)
  },
  branch2: {
    host: process.env.MIKROTIK_HOST_BRANCH2,
    user: process.env.MIKROTIK_USER,
    password: process.env.MIKROTIK_PASSWORD,
    port: parseInt(process.env.MIKROTIK_BRANCH2_PORT)
  },
  branch3: {
    host: process.env.MIKROTIK_HOST_BRANCH3,
    user: process.env.MIKROTIK_USER,
    password: process.env.MIKROTIK_PASSWORD,
    port: parseInt(process.env.MIKROTIK_PORT)
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

  // 1. تحديد الفرع بدقة والتأكد من وجوده
  const targetBranch = BRANCH_ROUTERS[branchKey] ? branchKey : "main";
  const routerConfig = BRANCH_ROUTERS[targetBranch];

  console.log(`🌐 [Mikrotik Service] جاري إرسال طلب الكارت إلى الفرع: [${targetBranch}] على العنوان: ${routerConfig.host || 'غير محدد'}:${routerConfig.port}`);

  // 2. التحقق من وجود Host حقيقي للفرع المطلوب
  if (!routerConfig.host) {
    throw new Error(`عنوان الـ IP أو الدومين الخاص بالفرع (${targetBranch}) غير معرّف في متغيرات البيئة في Render!`);
  }

  try {
    // 3. إنشاء الكارت في الميكروتيك للفرع المستهدف
    const cardCode = await createCardOnly(routerConfig, cardInfo.prefix, transactionId);

    // 4. تفعيل البروفايل عبر السكريبت
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
    throw new Error(`تعذر توليد الكارت وتفعيل الباقة للفرع (${targetBranch}): ${error.message}`);
  }
}

module.exports = {
  processPaymentAndCreateCard,
  getCardPrefixAndType,
  BRANCH_ROUTERS
};
