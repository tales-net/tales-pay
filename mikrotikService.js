const { processPaymentAndCreateCard: executeCardProcess } = require("./mikrotikCardService");
const { getRandomBlessingMessage } = require("./contributionMessages");

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
    port: parseInt(process.env.MIKROTIK_BRANCH_PORT)
  },
  branch3: {
    host: process.env.MIKROTIK_HOST_BRANCH3,
    user: process.env.MIKROTIK_USER,
    password: process.env.MIKROTIK_PASSWORD,
    port: parseInt(process.env.MIKROTIK_BRANCH_PORT)
  }
};

function getRouterConfig(branchName) {
  const branch = BRANCH_ROUTERS[branchName];
  if (!branch) {
    throw new Error(`اسم الفرع غير معروف أو غير معتمد: [${branchName}]`);
  }
  console.log(`📌 جاري الاتصال بالراوتر للفرع المختار: [${branchName}] على العنوان: ${branch.host || 'غير محدد'}:${branch.port}`);
  return branch;
}

function getCardPrefixAndType(amount) {
  const numAmount = Number(amount);
  switch (numAmount) {
    case 5:
      return { prefix: "01", profile: "Bronze", packageName: "الباقة البرونزية", isCustom: false, isContribution: false };
    case 15:
      return { prefix: "02", profile: "Silver", packageName: "الباقة الفضية", isCustom: false, isContribution: false };
    case 30:
      return { prefix: "05", profile: "Gold", packageName: "الباقة الذهبية", isCustom: false, isContribution: false };
    case 50:
      return { prefix: "10", profile: "Platinum", packageName: "الباقة البلاتينية", isCustom: false, isContribution: false };
    case 100:
      return { prefix: "25", profile: "Diamond", packageName: "الباقة الماسية", isCustom: false, isContribution: false };
    default:
      // إذا كان المبلغ أكبر من 100 جنيه، يتم اعتباره مساهمة ودعم لجميع الفروع
      if (numAmount > 100) {
        const blessingData = getRandomBlessingMessage(numAmount);
        return { 
          prefix: "", 
          profile: "", 
          packageName: "مساهمة ودعم للشبكة", 
          isCustom: false, 
          isContribution: true,
          blessingData: blessingData
        };
      }
      return { prefix: "", profile: "", packageName: "", isCustom: true, isContribution: false };
  }
}

async function processPaymentAndCreateCard(amount, branchKey = "main", transactionId = "") {
  const cardInfo = getCardPrefixAndType(amount);

  // معالجة حالة المساهمة المالية (أكبر من 100 جنيه) لجميع الفروع
  if (cardInfo.isContribution) {
    console.log(`🌸 [المساهمات] تم استلام مساهمة بقيمة ${amount} جنيه للفرع (${branchKey}) للمعاملة: ${transactionId}`);
    return {
      success: true,
      isContribution: true,
      amount: amount,
      branchKey: branchKey,
      transactionId: transactionId,
      blessing: cardInfo.blessingData
    };
  }

  if (cardInfo.isCustom) {
    return {
      success: true,
      isCustomAmount: true,
      amount: amount,
      message: "🌸 بالتوفيق لكم وبارك الله فيكم!"
    };
  }

  if (!BRANCH_ROUTERS[branchKey]) {
    throw new Error(`الفرع المطلوب (${branchKey}) غير مسجل في النظام!`);
  }

  const routerConfig = getRouterConfig(branchKey);

  if (!routerConfig.host) {
    throw new Error(`عنوان الـ IP أو الدومين الخاص بالفرع المختار (${branchKey}) غير معرّف في متغيرات البيئة في Render!`);
  }

  try {
    // 🛡️ استدعاء الدالة الموحدة لمنع التكرار وربط كارت واحد برقم العملية حصرياً للباقات العادية
    const result = await executeCardProcess(
      routerConfig, 
      cardInfo.prefix, 
      cardInfo.profile, 
      transactionId, 
      10
    );

    return {
      success: true,
      isCustomAmount: false,
      isContribution: false,
      cardCode: result.cardCode,
      amount: amount,
      packageName: cardInfo.packageName,
      profile: cardInfo.profile,
      branchKey: branchKey,
      transactionId: transactionId
    };

  } catch (error) {
    console.error(`❌ خطأ في معالجة الميكروتيك للفرع المحدد ${branchKey} (${routerConfig.host}):`, error.message);
    throw new Error(`تعذر توليد الكارت وتفعيل الباقة للفرع (${branchKey}): ${error.message}`);
  }
}

module.exports = {
  processPaymentAndCreateCard,
  getCardPrefixAndType,
  BRANCH_ROUTERS,
  getRouterConfig
};
