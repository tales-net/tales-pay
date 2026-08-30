const { RouterOSClient } = require("routeros-client");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * تفعيل الباقة/البروفايل للكارت عن طريق تشغيل السكريبت المخزن في الميكروتيك
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
    const api = await client.connect();
    console.log(`⚡ تشغيل سكريبت الميكروتيك لتفعيل الباقة للكارت: ${cardCode}`);

    // الأوامر بصيغة المصفوفة (Array) المدعومة بالكامل من مكتبة الاتصال
    const setCardCmd = ["/system/script/environment/set", "=name=currentCardName", `=value=${cardCode}`];
    const setProfileCmd = ["/system/script/environment/set", `=name=currentCardProfile`, `=value=${profileName}`];
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
      // الطريقة المباشرة البديلة عبر تمرير الأوامر
      throw new Error("لا توجد طريقة كتابة (write) متاحة في عميل الاتصال.");
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
