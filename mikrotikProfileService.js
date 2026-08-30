const { RouterOSClient } = require("routeros-client");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * تفعيل الباقة وإنشاء الكارت مباشرة بالطريقة المدعومة في واجهة و API اليوزر مانجر
 */
async function activateCardProfileViaScript(routerConfig, cardCode, profileName, delaySeconds = 5) {
  console.log(`⏳ الانتظار لمدة ${delaySeconds} ثوانٍ لتثبيت البيانات...`);
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
    console.log(`⚡ إنشاء وتفعيل الكارت: ${cardCode} بالبروفايل: ${profileName}`);

    // الخطوة 1: إنشاء المستخدم أولاً في اليوزر مانجر
    try {
      await conn.menu("/tool/user-manager/user").add({
        username: cardCode,
        password: cardCode,
        customer: "admin"
      });
    } catch (e) {
      // نتجاهل الخطأ لو كان موجوداً مسبقاً
    }

    // الخطوة 2: تفعيل البروفايل وربطه بالكارت ليظهر في قائمة اليوزر مانجر بالبروفايل الخاص به
    await conn.menu("/tool/user-manager/user").add({
      command: "create-and-activate-profile",
      user: cardCode,
      profile: profileName,
      customer: "admin"
    });

    await client.close().catch(() => {});
    console.log(`✅ تم إنشاء وتفعيل الكارت بالبروفايل بنجاح تام: ${cardCode} -> ${profileName}`);
    return true;

  } catch (error) {
    if (client) await client.close().catch(() => {});
    console.error(`❌ خطأ أثناء تفعيل البروفايل: ${error.message}`);
    throw new Error(`فشل تفعيل البروفايل في الميكروتيك: ${error.message}`);
  }
}

module.exports = { activateCardProfileViaScript };
