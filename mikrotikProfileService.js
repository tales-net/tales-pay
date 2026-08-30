const { RouterOSClient } = require("routeros-client");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function activateCardProfileViaScript(routerConfig, cardCode, profileName, delaySeconds = 10, maxRetries = 3) {
  console.log(`⏳ [الانتظار] الانتظار لمدة ${delaySeconds} ثوانٍ لتثبيت الكارت (${cardCode}) للباقة (${profileName})...`);
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
      console.log(`🔄 [محاولة ${attempt}/${maxRetries}] جاري الاتصال بالميكروتيك لتفعيل الكارت: ${cardCode} بالبروفايل: ${profileName}`);
      const conn = await client.connect();

      // طريقة آمنة لتنفيذ الأوامر تعتمد على menu الخاص بالمكتبة
      const scriptMenu = conn.menu("/system/script");

      // 1. تعيين المتغيرات العالمية عبر تنفيذ أوامر مباشرة لضمان وصول رقم الكارت والبروفايل
      // نقوم بتشغيل أمر تعيين المتغيرات مباشرة في الميكروتيك
      if (typeof conn.write === "function") {
        await conn.write(["/system/script/environment/set", "=name=currentCardName", `=value=${cardCode}`]);
        await conn.write(["/system/script/environment/set", "=name=currentCardProfile", `=value=${profileName}`]);
        await conn.write(["/system/script/run", "=.id=activate_profile_script"]);
      } else {
        // إذا لم تكن conn.write متاحة، نستخدم الطريقة البديلة المدعومة في الـ menu
        await scriptMenu.run({ ".id": "activate_profile_script" });
      }

      await client.close().catch(() => {});
      console.log(`🎉 [نجاح] تم تشغيل سكريبت تفعيل الباقة (${profileName}) للكارت: ${cardCode} في المحاولة ${attempt}!`);
      success = true;
      return true;

    } catch (error) {
      lastError = error;
      console.error(`❌ [خطأ في المحاولة ${attempt}] فشل تفعيل الكارت "${cardCode}" مع البروفايل "${profileName}". السبب: ${error.message}`);
      
      try {
        await client.close();
      } catch (e) {}

      if (attempt < maxRetries) {
        const waitTime = attempt * 3;
        console.log(`⏳ الانتظار لمدة ${waitTime} ثوانٍ قبل إعادة محاولة إرسال الكارت والبروفايل...`);
        await sleep(waitTime * 1000);
      }
    }
  }

  // طباعة تفاصيل الخطأ النهائي بوضوح شديد لمعرفة المشكلة فوراً
  console.error(`🚨 [فشل نهائي] الكارت: ${cardCode} | البروفايل المطلوب: ${profileName} | الخطأ الأخير: ${lastError ? lastError.message : "غير معروف"}`);

  throw new Error(
    `فشل تشغيل سكريبت البروفايل للكارت (${cardCode}) بروفايل (${profileName}) بعد ${maxRetries} محاولات. السبب: ${lastError ? lastError.message : "خطأ غير معروف"}`
  );
}

module.exports = { activateCardProfileViaScript };
