const { RouterOSClient } = require("routeros-client");

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

/**
 * توليد كود كارت إجمالي 10 أرقام (البادئة + 8 أرقام عشوائية)
 */
function generateCardCode(prefix) {
  const chars = "0123456789";
  const remainingLength = 10 - prefix.length; // البادئة رقمين، يتبقى 8 أرقام
  let result = prefix;
  for (let i = 0; i < remainingLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// دالة مساعدة لعمل مهلة زمنية (Delay) بالثواني
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const maxAttempts = 5;

  try {
    const api = await client.connect();

    while (!isCreated && attempts < maxAttempts) {
      attempts++;
      cardCode = generateCardCode(cardInfo.prefix);

      try {
        console.log(`👤 [User-Manager] جاري إضافة المستخدم (10 أرقام): ${cardCode}`);
        
        // 1. إضافة المستخدم في اليوزر مانجر أولاً
        await api.menu("/tool/user-manager/user").add({
          username: cardCode,
          password: cardCode,
          customer: "admin"
        });

        // 2. الانتظار لمدة 5 ثوانٍ لضمان استقرار السيرفر وتسجيل المستخدم بقاعدة بيانات اليوزر مانجر
        console.log(`⏳ [Wait] انتظار 5 ثوانٍ لتثبيت الكارت في قاعدة البيانات...`);
        await sleep(5000);

        console.log(`⚡ [User-Manager] جاري تفعيل البروفايل (${cardInfo.profile}) للمستخدم: ${cardCode}`);
        
        // 3. تفعيل البروفايل عبر الأمر المستقل المخصص لإصدار 5.26
        await api.menu("/tool/user-manager/user").add({
          command: "create-and-activate-profile",
          user: cardCode,
          profile: cardInfo.profile,
          customer: "admin"
        });

        isCreated = true;
      } catch (addError) {
        if (addError.message && (addError.message.includes("already exists") || addError.message.includes("already"))) {
          console.warn(`⚠️ الكود ${cardCode} موجود مسبقاً، جاري إعادة المحاولة...`);
          continue;
        } else {
          // محاولة احتياطية عبر الهوت سبوت العادي في حال فشل اليوزر مانجر
          try {
            console.log(`🔄 [Hotspot Fallback] جاري إضافته عبر الهوت سبوت التقليدي...`);
            await api.menu("/ip/hotspot/user").add({
              name: cardCode,
              password: cardCode,
              profile: cardInfo.profile,
              comment: `Paymob TXN: ${transactionId} | Branch: ${targetBranch}`
            });
            isCreated = true;
          } catch (hotspotError) {
            throw addError;
          }
        }
      }
    }

    await client.close();

    if (!isCreated) {
      throw new Error("فشل توليد كود فريد بعد عدة محاولات.");
    }

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
    if (client) await client.close().catch(() => {});
    console.error(`❌ خطأ في النظام:`, error.message);
    return {
      success: false,
      error: `تعذر توليد الكارت: ${error.message}`
    };
  }
}

module.exports = {
  processPaymentAndCreateCard,
  getCardPrefixAndType,
  BRANCH_ROUTERS
};
