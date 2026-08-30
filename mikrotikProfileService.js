const { RouterOSClient } = require("routeros-client");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const api = await client.connect();
    console.log(`⚡ تشغيل سكريبت الميكروتيك لتفعيل الباقة للكارت: ${cardCode}`);

    // 1. تعيين متغير اسم الكارت عالمياً
    const setCardCmd = ["/system/script/environment/set", "=name=currentCardName", `=value=${cardCode}`];
    // 2. تعيين متغير اسم البروفايل عالمياً
    const setProfileCmd = ["/system/script/environment/set", "=name=currentCardProfile", `=value=${profileName}`];
    // 3. تشغيل السكريبت المخزن مسبقاً في الميكروتيك
    const runScriptCmd = ["/system/script/run", "=.id=create_card_script"];

    if (typeof client.write === "function") {
      await client.write(setCardCmd);
      await client.write(setProfileCmd);
      await client.write(runScriptCmd);
    } else if (typeof api.write === "function") {
      await api.write(setCardCmd);
      await api.write(setProfileCmd);
      await api.write(runScriptCmd);
    } else {
      // الطريقة البديلة عبر menu
      await api.menu("/system/script").run({ ".id": "create_card_script" });
    }

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
