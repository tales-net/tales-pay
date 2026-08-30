const { RouterOSClient } = require("routeros-client");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * تفعيل البروفايل والباقة للكارت النظيف بعد الانتظار لجميع الفروع
 */
async function activateCardProfileViaScript(routerConfig, cardCode, profileName, delaySeconds = 10) {
  console.log(`⏳ الانتظار لمدة ${delaySeconds} ثوانٍ لتثبيت الكارت النظيف (${cardCode})...`);
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
    console.log(`⚡ تفعيل الباقة (${profileName}) للكارت: ${cardCode} على السيرفر: ${routerConfig.host}`);

    // تفعيل البروفايل وربطه بالكارت في اليوزر مانجر
    await conn.menu("/tool/user-manager/user").add({
      command: "create-and-activate-profile",
      user: cardCode,
      profile: profileName,
      customer: "admin"
    });

    await client.close().catch(() => {});
    console.log(`✅ تم تفعيل الباقة والبروفايل بنجاح تام للكارت: ${cardCode}`);
    return true;

  } catch (error) {
    if (client) await client.close().catch(() => {});
    console.error(`❌ خطأ أثناء تفعيل البروفايل: ${error.message}`);
    throw new Error(`فشل تفعيل البروفايل: ${error.message}`);
  }
}

module.exports = { activateCardProfileViaScript };
