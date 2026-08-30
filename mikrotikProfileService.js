const { RouterOSClient } = require("routeros-client");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * تفعيل الباقة باستخدام أمر الميكروتيك المباشر وبنظام محاولات ذكي (Retry)
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
      console.log(`🔄 [محاولة ${attempt}/${maxRetries}] إرسال أمر تفعيل البروفايل (${profileName}) للكارت: ${cardCode}`);
      const conn = await client.connect();

      // صياغة الأمر بصيغة مصفوفة مطابقة تماماً لأوامر الـ Terminal في الميكروتيك
      // /tool/user-manager/user/create-and-activate-profile user=... profile=... customer=admin
      const commandArray = [
        "/tool/user-manager/user/create-and-activate-profile",
        `=user=${cardCode}`,
        `=profile=${profileName}`,
        `=customer=admin`
      ];

      // إرسال الأمر بالطريقة الخام المباشرة المتوافقة مع الـ API
      if (typeof conn.write === "function") {
        await conn.write(commandArray);
      } else if (typeof client.write === "function") {
        await client.write(commandArray);
      } else {
        // طريقة بديلة لتنفيذ الأمر المباشر عبر الـ menu
        const rawMenu = conn.menu("/tool/user-manager/user");
        if (typeof rawMenu.write === "function") {
          await rawMenu.write("create-and-activate-profile", {
            user: cardCode,
            profile: profileName,
            customer: "admin"
          });
        } else {
          throw noSupportedWriteMethod();
        }
      }

      await client.close().catch(() => {});
      console.log(`🎉 تم تفعيل البروفايل (${profileName}) للكارت ${cardCode} بنجاح تام في المحاولة ${attempt}!`);
      success = true;
      return true;

    } catch (error) {
      lastError = error;
      console.warn(`⚠️ فشل المحاولة رقم ${attempt} للكارت ${cardCode}: ${error.message}`);
      
      try {
        await client.close();
      } catch (e) {}

      if (attempt < maxRetries) {
        const waitTime = attempt * 3; // الانتظار لفترة أطول تدريجياً
        console.log(`⏳ الانتظار لمدة ${waitTime} ثوانٍ قبل إعادة محاولة تفعيل الباقة...`);
        await sleep(waitTime * 1000);
      }
    }
  }

  throw new Error(
    `فشل تفعيل البروفايل بعد ${maxRetries} محاولات للمستخدم ${cardCode}. السبب الأخير: ${lastError ? lastError.message : "خطأ غير معروف"}`
  );
}

function noSupportedWriteMethod() {
  return new Error("لا توجد طريقة كتابة مدعومة لإرسال الأمر المباشر في الاتصال الحالي");
}

module.exports = { activateCardProfileViaScript };
