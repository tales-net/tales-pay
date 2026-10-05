const { RouterOSClient } = require("routeros-client");
const { getRandomBlessingMessage } = require("./contributionMessages");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BRANCH_ROUTERS = {
  main: {
    host: process.env.MIKROTIK_HOST,
    user: process.env.MIKROTIK_USER,
    password: process.env.MIKROTIK_PASSWORD,
    port: parseInt(process.env.MIKROTIK_PORT) || 8728
  },
  branch2: {
    host: process.env.MIKROTIK_HOST_BRANCH2,
    user: process.env.MIKROTIK_USER,
    password: process.env.MIKROTIK_PASSWORD,
    port: parseInt(process.env.MIKROTIK_PORT_BRANCH2 || process.env.MIKROTIK_BRANCH_PORT) || 8728
  },
  branch3: {
    host: process.env.MIKROTIK_HOST_BRANCH3,
    user: process.env.MIKROTIK_USER,
    password: process.env.MIKROTIK_PASSWORD,
    port: parseInt(process.env.MIKROTIK_PORT_BRANCH3 || process.env.MIKROTIK_BRANCH_PORT) || 8728
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

// ذاكرة مؤقتة لمنع تكرار المعاملات المكتملة حديثاً
const processedTransactions = new Set();

setInterval(() => {
  if (processedTransactions.size > 5000) {
    processedTransactions.clear();
  }
}, 60 * 60 * 1000);

function generateCardCode(prefix, randomLength = 8) {
  const chars = "0123456789";
  let result = prefix;
  for (let i = 0; i < randomLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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

async function createCardOnly(routerConfig, prefix, transactionId = "") {
  let cardCode = "";
  let isCreated = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isCreated && attempts < maxAttempts) {
    attempts++;
    cardCode = generateCardCode(prefix);

    const client = new RouterOSClient({
      host: routerConfig.host,
      user: routerConfig.user,
      password: routerConfig.password,
      port: routerConfig.port,
      timeout: 25
    });

    try {
      const conn = await client.connect();
      console.log(`👤 [User-Manager] محاولة إنشاء كارت جديد (محاولة ${attempts}): ${cardCode} على السيرفر: ${routerConfig.host} (معاملة: ${transactionId})`);

      await conn.menu("/tool/user-manager/user").add({
        username: cardCode,
        password: cardCode,
        customer: "admin"
      });

      await client.close().catch(() => {});
      isCreated = true;
      console.log(`✅ تم إنشاء الكارت بنظافة ودون تشابه: ${cardCode}`);

    } catch (error) {
      if (client) await client.close().catch(() => {});
      const errStr = error.message || "";
      
      if (errStr.includes("already exists") || errStr.includes("such username already exists")) {
        console.warn(`⚠️ الكود ${cardCode} موجود مسبقاً، جاري توليد رقم جديد تفادياً لأي تكرار...`);
        continue;
      } else {
        throw error;
      }
    }
  }

  if (!isCreated) {
    throw new Error("فشل توليد كود فريد وغير مكرر بعد عدة محاولات.");
  }

  return cardCode;
}

async function activateCardProfileViaScript(routerConfig, cardCode, profileName, delaySeconds = 10, maxRetries = 3) {
  console.log(`⏳ [الانتظار] الانتظار لمدة ${delaySeconds} ثوانٍ لضمان استقرار الكارت (${cardCode}) للباقة (${profileName})...`);
  await sleep(delaySeconds * 1000);

  let attempt = 0;
  let success = false;
  let lastError = null;

  while (attempt < maxRetries && !success) {
    attempt++;
    
    const client = new RouterOSClient({
      host: routerConfig.host,
      user: routerConfig.user,
      password: routerConfig.password,
      port: routerConfig.port,
      timeout: 15
    });

    try {
      console.log(`🔄 [محاولة ${attempt}/${maxRetries}] الاتصال بالسيرفر (${routerConfig.host}) لتفعيل الكارت: ${cardCode} بالبروفايل: ${profileName}`);
      const api = await client.connect();
      console.log(`✅ [MikroTik] تم الاتصال بالسيرفر بنجاح`);

      const scriptMenu = api.menu('/system/script');

      const updatedSource = `:local cardName "${cardCode}";\n` +
                            `:local cardProfile "${profileName}";\n` +
                            `\n` +
                            `# Activate user profile in User Manager\n` +
                            `/tool user-manager user create-and-activate-profile user=$cardName profile=$cardProfile customer=admin;\n` +
                            `\n` +
                            `:log warning ("activated profile (" . $cardProfile . ") for card: " . $cardName);`;

      await scriptMenu.where('name', 'activate_profile_script').set({
        source: updatedSource
      });
      console.log(`📝 [MikroTik] تم تحديث السكريبت بالكارت: ${cardCode} والبروفايل: ${profileName}`);

      await scriptMenu.exec('run', { number: 'activate_profile_script' });
      console.log(`🚀 [MikroTik] تم تشغيل السكريبت بنجاح للكارت: ${cardCode}`);

      await client.close().catch(() => {});
      console.log(`🎉 [نجاح تام] تم تفعيل البروفايل (${profileName}) للكارت (${cardCode}) في المحاولة ${attempt}!`);
      success = true;
      return true;

    } catch (error) {
      lastError = error;
      console.error(`❌ [خطأ في المحاولة ${attempt}] فشل تفعيل الكارت "${cardCode}" مع البروفايل "${profileName}":`, error.message || error);
      
      try {
        await client.close();
      } catch (e) {}

      if (attempt < maxRetries) {
        const waitTime = attempt * 3;
        console.log(`⏳ الانتظار لمدة ${waitTime} ثوانٍ قبل إعادة المحاولة...`);
        await sleep(waitTime * 1000);
      }
    }
  }

  console.error(`🚨 [فشل نهائي] الكارت: ${cardCode} | البروفايل المطلوب: ${profileName} | الخطأ الأخير: ${lastError ? lastError.message : "غير معروف"}`);

  throw new Error(
    `فشل تشغيل سكريبت البروفايل للكارت (${cardCode}) بروفايل (${profileName}) بعد ${maxRetries} محاولات. السبب: ${lastError ? lastError.message : "خطأ غير معروف"}`
  );
}

async function processPaymentAndCreateCard(amount, branchKey = "main", transactionId = "") {
  const cardInfo = getCardPrefixAndType(amount);

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

  if (transactionId && processedTransactions.has(String(transactionId))) {
    console.warn(`🛑 [حماية التكرار] المعاملة برقم (${transactionId}) عולجت مسبقاً. تم منع إصدار كارت مكرر.`);
    throw new Error(`Duplicate transaction prevented: ${transactionId}`);
  }

  try {
    console.log(`🚀 بدء عملية إصدار الكارت وتفعيله بعد الدفع للمعاملة: ${transactionId} للفرع: ${branchKey}`);
    
    const cardCode = await createCardOnly(routerConfig, cardInfo.prefix, transactionId);
    await activateCardProfileViaScript(routerConfig, cardCode, cardInfo.profile, 10);

    if (transactionId) {
      processedTransactions.add(String(transactionId));
    }

    return {
      success: true,
      isCustomAmount: false,
      isContribution: false,
      cardCode: cardCode,
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
  getRouterConfig,
  generateCardCode,
  createCardOnly,
  activateCardProfileViaScript
};
