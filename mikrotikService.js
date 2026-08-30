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

function generateCardCode(prefix, randomLength = 8) {
  const chars = "0123456789";
  let result = prefix;
  for (let i = 0; i < randomLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

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

  let cardCode = "";
  let isCreated = false;
  let attempts = 0;
  const maxAttempts = 5;

  try {
    while (!isCreated && attempts < maxAttempts) {
      attempts++;
      cardCode = generateCardCode(cardInfo.prefix);

      const client = new RouterOSClient({
        host: routerConfig.host,
        user: routerConfig.user,
        password: routerConfig.password,
        port: routerConfig.port,
        timeout: 10
      });

      try {
        const api = await client.connect();

        // الخطوة 1: إضافة الكارت أولاً
        console.log(`👤 [User-Manager] (${targetBranch}) محاولة إضافة الكارت: ${cardCode}`);
        
        await api.menu("/tool/user-manager/user").add({
          username: cardCode,
          password: cardCode,
          customer: "admin"
        });

        // إذا تم الإضافة بنجاح، نقوم بقطع الاتصال مؤقتاً
        await client.close().catch(() => {});

        // الانتظار لمدة 10 ثوانٍ لضمان التثبيت الكامل كما طلبت
        console.log(`⏳ تم إضافة الكارت بنجاح، الانتظار 10 ثوانٍ قبل تفعيل الباقة...`);
        await sleep(10000);

        // الخطوة 2: إعادة الاتصال وتفعيل البروفايل/الباقة
        console.log(`⚡ [User-Manager] جاري تفعيل الباقة (${cardInfo.profile}) للكارت: ${cardCode}`);
        
        const client2 = new RouterOSClient({
          host: routerConfig.host,
          user: routerConfig.user,
          password: routerConfig.password,
          port: routerConfig.port,
          timeout: 10
        });

        const api2 = await client2.connect();

        const activateCommand = [
          "/tool/user-manager/user/create-and-activate-profile",
          `=user=${cardCode}`,
          `=profile=${cardInfo.profile}`,
          `=customer=admin`
        ];

        if (typeof client2.write === "function") {
          await client2.write(activateCommand);
        } else if (typeof api2.write === "function") {
          await api2.write(activateCommand);
        } else {
          await api2.menu("/tool/user-manager/user").add({
            command: "create-and-activate-profile",
            user: cardCode,
            profile: cardInfo.profile,
            customer: "admin"
          });
        }

        await client2.close().catch(() => {});
        isCreated = true; // تم إنشاء وتفعيل الكارت بنجاح تام!

      } catch (stepError) {
        if (client) await client.close().catch(() => {});
        
        // التحقق مما إذا كان الخطأ بسبب أن الكارت موجود مسبقاً
        const errStr = stepError.message || "";
        if (errStr.includes("already exists") || errStr.includes("such username already exists")) {
          console.warn(`⚠️ الكود ${cardCode} موجود مسبقاً، سيتم توليد رقم كارت جديد وإعادة المحاولة...`);
          continue; // الاستمرار في الـ while لتوليد رقم جديد
        } else {
          // إذا كان خطأ آخر غير تكرار الاسم، نقوم برميه لإظهاره
          throw stepError;
        }
      }
    }

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
    return {
      success: false,
      error: `تعذر توليد الكارت تلقائياً: ${error.message}`
    };
  }
}

module.exports = {
  processPaymentAndCreateCard,
  getCardPrefixAndType,
  BRANCH_ROUTERS
};
