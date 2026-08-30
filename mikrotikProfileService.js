const { RouterOSClient } = require("routeros-client");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * تفعيل الباقة/البروفايل للكارت بطريقة مطابقة تماماً لأمر الـ Terminal
 */
async function activateCardProfile(routerConfig, cardCode, profileName, delaySeconds = 10) {
  console.log(`⏳ الانتظار لمدة ${delaySeconds} ثوانٍ قبل تفعيل الباقة للكارت: ${cardCode}`);
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
    console.log(`⚡ تنفيذ الأمر في الميكروتيك: /tool/user-manager/user/create-and-activate-profile user="${cardCode}" profile="${profileName}" customer=admin`);

    // إرسال الأمر بصيغة مصفوفة الخام (Raw Command Array) تماماً كما يُكتب في الـ Terminal
    const response = await client.write([
      "/tool/user-manager/user/create-and-activate-profile",
      `=user=${cardCode}`,
      `=profile=${profileName}`,
      `=customer=admin`
    ]);

    await client.close().catch(() => {});
    console.log(`✅ تمت عملية تفعيل الباقة بنجاح للكارت: ${cardCode}`, response);
    return true;

  } catch (error) {
    if (client) await client.close().catch(() => {});
    console.error(`❌ خطأ أثناء تفعيل البروفايل: ${error.message}`);
    throw new Error(`فشل تفعيل البروفايل: ${error.message}`);
  }
}

module.exports = { activateCardProfile };
