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
    console.log(`⚡ تعيين المتغيرات وتشغيل سكريبت البروفايل في الميكروتيك...`);

    // 1. تعيين اسم الكارت في المتغيرات العالمية
    const setCardCmd = ["/system/script/environment/set", "=name=currentCardName", `=value=${cardCode}`];
    
    // 2. تعيين اسم الباقة/البروفايل في المتغيرات العالمية
    const setProfileCmd = ["/system/script/environment/set", "=name=currentCardProfile", `=value=${profileName}`];
    
    // 3. تشغيل السكريبت المخزن مسبقاً في الميكروتيك باسم activate_profile_script
    const runScriptCmd = ["/system/script/run", "=.id=activate_profile_script"];

    // إرسال الأوامر بالترتيب بالطريقة المدعومة تماماً في المكتبة
    if (typeof client.write === "function") {
      await client.write(setCardCmd);
      await client.write(setProfileCmd);
      await client.write(runScriptCmd);
    } else if (typeof api.write === "function") {
      await api.write(setCardCmd);
      await api.write(setProfileCmd);
      await api.write(runScriptCmd);
    } else {
      throw new Error("لا توجد دالة كتابة (write) صالحة في اتصال RouterOSClient");
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
