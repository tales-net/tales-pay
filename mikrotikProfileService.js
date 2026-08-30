const { RouterOSClient } = require("routeros-client");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * تنفيذ أوامر اليوزر مانجر مع نظام إعادة المحاولة التلقائي (Retry) لضمان نجاح تفعيل الباقة
 */
async function activateCardProfileViaScript(routerConfig, cardCode, profileName, delaySeconds = 10, maxRetries = 3) {
  console.log(`⏳ الانتظار لمدة ${delaySeconds} ثوانٍ لضمان استقرار الكارت (${cardCode}) في السيرفر...`);
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
      console.log(`🔄 [محاولة ${attempt}/${maxRetries}] الاتصال بالميكروتيك وتفعيل البروفايل (${profileName}) للكارت: ${cardCode}`);
      const conn = await client.connect();
      const userManager = conn.menu("/tool/user-manager/user");

      // 1. إضافة المستخدم أولاً (احتياطياً)
      try {
        await userManager.add({
          username: cardCode,
          password: cardCode,
          customer: "admin"
        });
        console.log(`✅ تم إضافة المستخدم ${cardCode} في اليوزر مانجر بنجاح.`);
      } catch (addErr) {
        // نتجاوز الخطأ إذا كان المستخدم مضافاً مسبقاً
        console.log(`ℹ️ ملاحظة (المستخدم موجود أو تم تخطيه): ${addErr.message}`);
      }

      // 2. تفعيل البروفايل للمستخدم
      await userManager.add({
        command: "create-and-activate-profile",
        user: cardCode,
        profile: profileName,
        customer: "admin"
      });

      await client.close().catch(() => {});
      console.log(`🎉 تم تفعيل البروفايل (${profileName}) للكارت ${cardCode} بنجاح تام في المحاولة ${attempt}!`);
      success = true;
      return true;

    } catch (error) {
      lastError = error;
      console.warn(`⚠️ فشل المحاولة رقم ${attempt} للكارت ${cardCode}: ${error.message}`);
      
      // إغلاق الاتصال بأمان قبل المحاولة التالية
      try {
        await client.close();
      } catch (e) {}

      if (attempt < maxRetries) {
        const waitTime = attempt * 3; // زيادة وقت الانتظار تدريجياً بين المحاولات (3 ثوانٍ ثم 6 ثوانٍ...)
        console.log(`⏳ الانتظار لمدة ${waitTime} ثوانٍ قبل إعادة محاولة تفعيل الباقة...`);
        await sleep(waitTime * 1000);
      }
    }
  }

  // إذا نفدت جميع المحاولات ولم يتم النجاح
  throw new Error(
    `فشل تفعيل البروفايل بعد ${maxRetries} محاولات للمستخدم ${cardCode}. السبب الأخير: ${lastError ? lastError.message : "خطأ غير معروف"}`
  );
}

module.exports = { activateCardProfileViaScript };
