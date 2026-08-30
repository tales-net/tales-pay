const { RouterOSClient } = require("routeros-client");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * تفعيل الباقة/البروفايل للكارت باستخدام الطريقة المباشرة المطابقة للـ Terminal
 */
async function activateCardProfile(routerConfig, cardCode, profileName, delaySeconds = 10) {
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
    console.log(`⚡ [User-Manager] جاري إرسال أمر تفعيل الباقة (${profileName}) للكارت: ${cardCode}`);

    // مصفوفة الأوامر المطابقة تماماً للأمر الناجح في الـ Terminal:
    // /tool user-manager user create-and-activate-profile user="..." profile="..." customer=admin
    const activateCommand = [
      "/tool/user-manager/user/create-and-activate-profile",
      `=user=${cardCode}`,
      `=profile=${profileName}`,
      `=customer=admin`
    ];

    // تنفيذ الأمر بالطريقة المباشرة المتاحة في عميل الاتصال
    if (typeof client.write === "function") {
      await client.write(activateCommand);
    } else if (typeof api.write === "function") {
      await api.write(activateCommand);
    } else if (typeof client.send === "function") {
      await client.send(activateCommand);
    } else {
      // محاولة بديلة عبر القائمة إذا لم تتوفر كتابة مباشرة
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
    console.error(`❌ خطأ أثناء تفعيل الباقة للكارت ${cardCode}:`, error.message);
    throw new Error(`تعذر تفعيل الباقة في اليوزر مانجر: ${error.message}`);
  }
}

module.exports = { activateCardProfile };
