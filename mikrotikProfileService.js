const { RouterOSClient } = require("routeros-client");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * تفعيل الباقة/البروفايل للكارت بعد الانتظار
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
    console.log(`⚡ [User-Manager] تفعيل الباقة (${profileName}) للكارت: ${cardCode}`);

    const activateCommand = [
      "/tool/user-manager/user/create-and-activate-profile",
      `=user=${cardCode}`,
      `=profile=${profileName}`,
      `=customer=admin`
    ];

    if (typeof client.write === "function") {
      await client.write(activateCommand);
    } else if (typeof api.write === "function") {
      await api.write(activateCommand);
    } else {
      await api.menu("/tool/user-manager/user").add({
        command: "create-and-activate-profile",
        user: cardCode,
        profile: profileName,
        customer: "admin"
      });
    }

    await client.close().catch(() => {});
    console.log(`✅ تم تفعيل الباقة بنجاح للكارت: ${cardCode}`);
    return true;
  } catch (error) {
    if (client) await client.close().catch(() => {});
    throw new Error(`فشل تفعيل البروفايل: ${error.message}`);
  }
}

module.exports = { activateCardProfile };
