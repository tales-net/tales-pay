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

  let conn;
  try {
    conn = await client.connect();
    console.log(`⚡ تشغيل سكريبت الميكروتيك لتفعيل الباقة للكارت: ${cardCode}`);

    // الطريقة القياسية المعتمدة في routeros-client لتنفيذ الأوامر
    // 1. تعيين اسم الكارت في المتغير العالمي
    await conn.menu("/system/script/environment").add({
      name: "currentCardName",
      value: cardCode
    }).catch(async () => {
      // لو المتغير موجود مسبقاً نقوم بتحديثه
      await conn.write(["/system/script/environment/set", `=name=currentCardName`, `=value=${cardCode}`]);
    });

    // 2. تعيين اسم البروفايل في المتغير العالمي
    await conn.menu("/system/script/environment").add({
      name: "currentCardProfile",
      value: profileName
    }).catch(async () => {
      await conn.write(["/system/script/environment/set", `=name=currentCardProfile`, `=value=${profileName}`]);
    });

    // 3. تشغيل السكريبت المخزن
    if (typeof conn.write === "function") {
      await conn.write(["/system/script/run", `=.id=create_card_script`]);
    } else {
      // طريقة بديلة لتنفيذ الأوامر المباشرة
      const channel = await client.openChannel();
      await channel.write(["/system/script/run", `=.id=create_card_script`]);
      await channel.close();
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
