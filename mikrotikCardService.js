const { RouterOSClient } = require("routeros-client");

function generateCardCode(prefix, randomLength = 8) {
  const chars = "0123456789";
  let result = prefix;
  for (let i = 0; i < randomLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * إضافة الكارت في اليوزر مانجر مع فحص التشابه والتكرار لجميع الفروع
 */
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
      console.log(`👤 [User-Manager] محاولة إنشاء كارت جديد (محاولة ${attempts}): ${cardCode} على السيرفر: ${routerConfig.host}`);

      // إضافة المستخدم في اليوزر مانجر
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
      
      // إذا كان الكارت مكرراً أو موجوداً مسبقاً، نتجاهله ونولد رقماً جديداً نظيفاً
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

module.exports = { createCardOnly, generateCardCode };
