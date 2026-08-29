const { RouterOSClient } = require("routeros-client");

/**
 * جلب إعدادات السيرفر من متغيرات البيئة ENV بدعم الفروع المتعددة
 */
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

/**
 * تحديد بادئة الكارت، اسم البروفايل، واسم الباقة بناءً على المبلغ المدفوع
 */
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
 * توليد كود كارت عشوائي (أرقام فقط) يبدأ بالبادئة المحددة
 */
function generateCardCode(prefix, randomLength = 6) {
  const chars = "0123456789";
  let result = prefix;
  for (let i = 0; i < randomLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * الدالة الرئيسية لمعالجة الدفع وإنشاء الكارت وتفعيله لنسخة ميكروتيك 5.26
 */
async function processPaymentAndCreateCard(amount, branchKey = "main", transactionId = "") {
  const cardInfo = getCardPrefixAndType(amount);

  if (cardInfo.isCustom) {
    return {
      success: true,
      isCustomAmount: true,
      amount: amount,
      message: "🌸 بالتوفيق لكم وبارك الله فيكم! نشكركم جزيل الشكر على دعمكم الكريم."
    };
  }

  const targetBranch = BRANCH_ROUTERS[branchKey] ? branchKey : "main";
  const routerConfig = BRANCH_ROUTERS[targetBranch];

  console.log(`🌐 [MikroTik v5.26] جاري الاتصال بالفرع: [ ${targetBranch.toUpperCase()} ] على العنوان: ${routerConfig.host}`);

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
        // طريقة إضافة المستخدم في Hotspot Users مباشرة (أكثر استقراراً في النسخ القديمة 5.x)
        console.log(`👤 [Hotspot User] (${targetBranch}) جاري إضافة المستخدم: ${cardCode}`);
        
        await api.menu("/ip/hotspot/user").add({
          name: cardCode,
          password: cardCode,
          profile: cardInfo.profile,
          comment: `Paymob TXN: ${transactionId} | Branch: ${targetBranch}`
        });

        isCreated = true;
      } catch (addError) {
        if (addError.message && (addError.message.includes("already exists") || addError.message.includes("already"))) {
          console.warn(`⚠️ [${targetBranch}] الكود ${cardCode} موجود مسبقاً، جاري إعادة المحاولة...`);
        } else {
          // محاولة بديلة لنسخ User-Manager القديمة إذا فشل الـ Hotspot User العادي
          try {
            console.log(`🔄 [User-Manager v5] محاولة إضافة عبر اليوزر مانجر القديم للمستخدم: ${cardCode}`);
            await api.menu("/tool/user-manager/user").add({
              username: cardCode,
              password: cardCode,
              customer: "admin"
            });
            
            await api.menu("/tool/user-manager/user").cmd("set-rates", {
              numbers: cardCode,
              profile: cardInfo.profile
            });
            isCreated = true;
          } catch (umError) {
            throw addError; // إذا فشلت الطريقتان يرمي الخطأ الأصلي للفحص
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
    console.error(`❌ خطأ في الاتصال بميكروتيك الفرع (${targetBranch}) إصدار 5.26:`, error.message);
    if (client) await client.close().catch(() => {});

    return {
      success: false,
      error: `تعذر توليد الكارت تلقائياً من نظام شبكة (${targetBranch}): ${error.message}`
    };
  }
}

module.exports = {
  processPaymentAndCreateCard,
  getCardPrefixAndType,
  BRANCH_ROUTERS
};
