const { RouterOSClient } = require("routeros-client");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * تمرير المتغيرات وتشغيل سكريبت الميكروتيك لتفعيل البروفايل مع محاولات ذكية
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
      console.log(`🔄 [محاولة ${attempt}/${maxRetries}] تمرير الكارت (${cardCode}) والبروفايل (${profileName}) للـ Script...`);
      const conn = await client.connect();

      // الأوامر التي سيتم إرسالها للميكروتيك بالتسلسل تماماً مثل الـ Terminal
      // 1. تعيين متغير اسم الكارت عالمياً
      const setCardCmd = ["/system/script/environment/set", "=name=currentCardName", `=value=${cardCode}`];
      
      // 2. تعيين متغير اسم البروفايل عالمياً
      const setProfileCmd = ["/system/script/environment/set", "=name=currentCardProfile", `=value=${profileName}`];
      
      // 3. تشغيل السكريبت المخزن
      const runScriptCmd = ["/system/script/run", "=.id=activate_profile_script"];

      // إرسال الأوامر بالترتيب باستخدام دالة conn.write المعتمدة في المكتبة
      if (typeof conn.write === "function") {
        await conn.write(setCardCmd);
        await conn.write(setProfileCmd);
        await conn.write(runScriptCmd);
      } else if (typeof client.write === "function") {
        await client.write(setCardCmd);
        await client.write(setProfileCmd);
        await client.write(runScriptCmd);
      } else {
        throw new Error("لا توجد دالة كتابة (write) صالحة في اتصال RouterOSClient");
      }

      await client.close().catch(() => {});
      console.log(`🎉 تم تشغيل سكريبت تفعيل الباقة بنجاح تام للكارت: ${cardCode} في المحاولة ${attempt}!`);
      success = true;
      return true;

    } catch (error) {
      lastError = error;
      console.warn(`⚠️ فشل المحاولة رقم ${attempt} لتشغيل السكريبت: ${error.message}`);
      
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

  throw new Error(
    `فشل تشغيل سكريبت البروفايل بعد ${maxRetries} محاولات للمستخدم ${cardCode}. السبب الأخير: ${lastError ? lastError.message : "خطأ غير معروف"}`
  );
}

module.exports = { activateCardProfileViaScript };
