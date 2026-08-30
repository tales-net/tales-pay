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

// دالة مساعدة لعمل تأخير زمني (Delay) بالمللي ثانية
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

        // -------------------------------------------------------------
        // الخطوة الأولى: إضافة الكارت فقط في اليوزر مانجر
        // -------------------------------------------------------------
        console.log(`👤 [User-Manager] (${targetBranch}) المحاولة ${attempts}: إضافة الكارت ${cardCode}`);
        
        await api.menu("/tool/user-manager/user").add({
          username: cardCode,
          password: cardCode,
          customer: "admin"
        });

        // قطع الاتصال الأول مؤقتاً لتجهيز خطوة التفعيل
        await client.close().catch(() => {});

        // -------------------------------------------------------------
        // الانتظار لمدة 10 ثوانٍ لضمان استقرار الكارت في قاعدة البيانات
        // -------------------------------------------------------------
        console.log(`⏳ جاري الانتظار 10 ثوانٍ لضمان تثبيت الكارت قبل تفعيل الباقة...`);
        await sleep(10000);

        // -------------------------------------------------------------
        // الخطوة الثانية: إعادة الاتصال وتفعيل الباقة/البروفايل
        // -------------------------------------------------------------
        console.log(`⚡ [User-Manager] (${targetBranch}) تفعيل الباقة (${cardInfo.profile}) للكارت: ${cardCode}`);
        
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

        if (typeof api2.write === "function") {
          await api2.write(activateCommand);
        } else if (typeof client2.write === "function") {
          await client2.write(activateCommand);
        } else {
          await api2.menu("/tool/user-manager/user").add({
            command: "create-and-activate-profile",
            user: cardCode,
            profile: cardInfo.profile,
            customer: "admin"
          });
        }

        await client2.close().catch(() => {});
        isCreated = true;

      } catch (stepError) {
        if (client) await client.close().catch(() => {});
        
        if (stepError.message && (stepError.message.includes("already exists") || stepError.message.includes("already"))) {
          console.warn(`⚠️ الكود ${cardCode} موجود مسبقاً، سيتم توليد كود جديد...`);
          continue;
        } else {
          // إذا فشلت طريقة اليوزر مانجر، نجرب الطريقة الاحتياطية المباشرة عبر الهوت سبوت
          console.warn(`⚠️ فشل اليوزر مانجر، المحاولة عبر الهوت سبوت العادي...`);
          const fallbackClient = new RouterOSClient({
            host: routerConfig.host,
            user: routerConfig.user,
            password: routerConfig.password,
            port: routerConfig.port,
            timeout: 10
          });
          const fbApi = await fallbackClient.connect();
          await fbApi.menu("/ip/hotspot/user").add({
            name: cardCode,
            password: cardCode,
            profile: cardInfo.profile,
            comment: `Paymob TXN: ${transactionId} | Branch: ${targetBranch}`
          });
          await fallbackClient.close().catch(() => {});
          isCreated = true;
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
