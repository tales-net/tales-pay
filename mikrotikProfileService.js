const { RouterOSClient } = require("routeros-client");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * تفعيل الباقة مباشرة باستخدام أمر create-and-activate-profile للميكروتيك
 */
async function activateCardProfileViaScript(routerConfig, cardCode, profileName, delaySeconds = 10) {
  console.log(`⏳ الانتظار لمدة ${delaySeconds} ثوانٍ لضمان استقرار الكارت (${cardCode}) في السيرفر...`);
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
    console.log(`⚡ [User-Manager] تنفيذ أمر تفعيل البروفايل (${profileName}) للكارت: ${cardCode}`);

    // إرسال الأمر مباشرة كقائمة مطابقة تماماً للـ Terminal
    const commandArray = [
      "/tool/user-manager/user/create-and-activate-profile",
      `=user=${cardCode}`,
      `=profile=${profileName}`,
      `=customer=admin`
    ];

    if (typeof client.write === "function") {
      await client.write(commandArray);
    } else if (typeof api.write === "function") {
      await api.write(commandArray);
    } else {
      await api.menu("/tool/user-manager/user").add({
        command: "create-and-activate-profile",
        user: cardCode,
        profile: profileName,
        customer: "admin"
      });
    }

    await client.close().catch(() => {});
    console.log(`✅ تم تفعيل الباقة بنجاح تام للكارت: ${cardCode}`);
    return true;

  } catch (error) {
    if (client) await client.close().catch(() => {});
    console.error(`❌ خطأ أثناء تفعيل الباقة: ${error.message}`);
    throw new Error(`فشل تفعيل البروفايل: ${error.message}`);
  }
}

// التأكد من تصدير الدالة بالاسم الذي يستدعيه ملف mikrotikService.js
module.exports = { activateCardProfileViaScript };
