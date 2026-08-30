const { RouterOSClient } = require("routeros-client");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * تفعيل الباقة/البروفايل للكارت عن طريق تشغيل السكريبت المخزن في الميكروتيك تماماً مثل الـ Terminal
 */
async function activateCardProfileViaScript(routerConfig, cardCode, profileName, delaySeconds = 10) {
  console.log(`⏳ الانتظار لمدة ${delaySeconds} ثوانٍ لتثبيت الكارت (${cardCode})...`);
  await sleep(delaySeconds * 1000);

  const client = new RouterOSClient({
    host: routerConfig.host,
    user: routerConfig.user,
    password: routerConfig.password,
    port: routerConfig.port,
    timeout: 10
  });

  try {
    const conn = await client.connect();
    console.log(`⚡ تشغيل سكريبت الميكروتيك لتفعيل الباقة للكارت: ${cardCode}`);

    // إرسال الأوامر بالترتيب تماماً مثل الـ Terminal
    // 1. تعيين المتغير العالمي للكارت
    await conn.write([
      "/system/script/environment/set",
      `=name=currentCardName`,
      `=value=${cardCode}`
    ]);

    // 2. تعيين المتغير العالمي للبروفايل
    await conn.write([
      "/system/script/environment/set",
      `=name=currentCardProfile`,
      `=value=${profileName}`
    ]);

    // 3. تشغيل السكريبت
    await conn.write([
      "/system/script/run",
      `=.id=create_card_script`
    ]);

    await client.close().catch(() => {});
    console.log(`✅ تم تنفيذ السكريبت وتفعيل الباقة بنجاح للكارت: ${cardCode}`);
    return true;

  } catch (error) {
    if (client) await client.close().catch(() => {});
    console.error(`❌ خطأ أثناء تشغيل السكريبت: ${error.message}`);
    throw new Error(`فشل تشغيل سكريبت الميكروتيك: ${error.message}`);
  }
}

module.exports = { activateCardProfileViaScript };
