const { RouterOSClient } = require('routeros-client');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * تفعيل الباقة عبر تحديث وتشغيل السكريبت في الميكروتيك بطريقة احترافية
 */
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

      // تصميم محتوى السكريبت ديناميكياً وتمرير رقم الكارت والبروفايل بداخله
      const updatedSource = `:local cardName "${cardCode}";\n` +
                            `:local cardProfile "${profileName}";\n` +
                            `\n` +
                            `# تنفيذ أمر التفعيل في اليوزر مانجر\n` +
                            `/tool user-manager user create-and-activate-profile user=$cardName profile=$cardProfile customer=admin;\n` +
                            `\n` +
                            `:log warning ("تم بنجاح تفعيل الباقة (" . $cardProfile . ") للكارت: " . $cardName);`;

      // 1. تحديث محتوى السكريبت الموجود في الميكروتيك بالقيم الجديدة
      await scriptMenu.where('name', 'activate_profile_script').set({
        source: updatedSource
      });
      console.log(`📝 [MikroTik] تم تحديث السكريبت بالكارت: ${cardCode} والبروفايل: ${profileName}`);

      // 2. تشغيل السكريبت
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

module.exports = { activateCardProfileViaScript };
