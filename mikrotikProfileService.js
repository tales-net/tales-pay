const { RouterOSClient } = require("routeros-client");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function activateCardProfileViaScript(routerConfig, cardCode, profileName, delaySeconds = 10) {
  console.log(`⏳ الانتظار لمدة ${delaySeconds} ثوانٍ قبل تشغيل سكريبت تفعيل الباقة للكارت (${cardCode})...`);
  await sleep(delaySeconds * 1000);

  const client = new RouterOSClient({
    host: routerConfig.host,
    user: routerConfig.user,
    password: routerConfig.password,
    port: routerConfig.port,
    timeout: 10
  });

  try {
    const api = await client.connect();
    console.log(`⚡ تمرير المتغيرات وتشغيل سكريبت البروفايل في الميكروتيك...`);

    // 1. تعيين اسم الكارت في البيئة العالمية للميكروتيك
    const setCardCmd = ["/system/script/environment/set", "=name=currentCardName", `=value=${cardCode}`];
    
    // 2. تعيين اسم الباقة/البروفايل في البيئة العالمية للميكروتيك
    const setProfileCmd = ["/system/script/environment/set", "=name=currentCardProfile", `=value=${profileName}`];
    
    // 3. تشغيل السكريبت المخصص لتفعيل البروفايل
    const runScriptCmd = ["/system/script/run", "=.id=activate_profile_script"];

    if (typeof client.write === "function") {
      await client.write(setCardCmd);
      await client.write(setProfileCmd);
      await client.write(runScriptCmd);
    } else if (typeof api.write === "function") {
      await api.write(setCardCmd);
      await client.write(setProfileCmd);
      await client.write(runScriptCmd);
    } else {
      await api.menu("/system/script").run({ ".id": "activate_profile_script" });
    }

    await client.close().catch(() => {});
    console.log(`✅ تم تنفيذ سكريبت البروفايل بنجاح تام للكارت: ${cardCode}`);
    return true;

  } catch (error) {
    if (client) await client.close().catch(() => {});
    console.error(`❌ خطأ أثناء تشغيل سكريبت البروفايل: ${error.message}`);
    throw new Error(`فشل تشغيل سكريبت البروفايل: ${error.message}`);
  }
}

module.exports = { activateCardProfileViaScript };
