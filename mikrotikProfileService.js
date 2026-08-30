const { RouterOSClient } = require("routeros-client");

async function activateCardProfileViaScript(routerConfig, cardCode, profileName) {
  const client = new RouterOSClient({
    host: routerConfig.host,
    user: routerConfig.user,
    password: routerConfig.password,
    port: routerConfig.port,
    timeout: 10
  });

  try {
    await client.connect();

    // البحث عن المستخدم وتحديث البروفايل الخاص به
    const users = await client.menu("/ip/hotspot/user").where({ name: cardCode }).getAll();
    
    if (users && users.length > 0) {
      const userId = users[0][".id"];
      await client.menu("/ip/hotspot/user").set({
        ".id": userId,
        profile: profileName
      });
    }

    await client.close();
    return { success: true };
  } catch (err) {
    try { await client.close(); } catch (e) {}
    console.error(`❌ خطأ في تعيين بروفايل الكارت (${routerConfig.host}):`, err.message);
    // لا نوقف العملية تماماً إذا تم إنشاء الكارت بالفعل، ولكن نسجل الخطأ
    return { success: false, error: err.message };
  }
}

module.exports = { activateCardProfileViaScript };
