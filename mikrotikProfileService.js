const { RouterOSClient } = require("routeros-client");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * تفعيل الباقة وإضافتها كبروفايل للمستخدم في اليوزر مانجر
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
    console.log(`⚡ ربط وتفعيل البروفايل (${profileName}) للكارت: ${cardCode}`);

    // الطريقة الصحيحة لربط البروفايل بالمستخدم في User-Manager عبر الـ API
    await conn.menu("/tool/user-manager/user").add({
      command: "create-and-activate-profile",
      user: cardCode,
      profile: profileName,
      customer: "admin"
    }).catch(async () => {
      // طريقة بديلة مباشرة في حال لم يقبل الأمر المتقدم، عن طريق إضافة البروفايل للمستخدم مباشرة
      await conn.menu("/tool/user-manager/user/profile").add({
        user: cardCode,
        profile: profileName,
        customer: "admin"
      });
    });

    await client.close().catch(() => {});
    console.log(`✅ تم تفعيل البروفايل بنجاح تام للكارت: ${cardCode}`);
    return true;

  } catch (error) {
    if (client) await client.close().catch(() => {});
    console.error(`❌ خطأ أثناء تفعيل البروفايل: ${error.message}`);
    throw new Error(`فشل تفعيل البروفايل: ${error.message}`);
  }
}

module.exports = { activateCardProfileViaScript };
