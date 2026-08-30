const { RouterOSClient } = require("routeros-client");

function generateRandomCode() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // تجنب الحروف المتشابهة لتسهيل القراءة
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function createCardOnly(routerConfig, prefix = "HIK") {
  const client = new RouterOSClient({
    host: routerConfig.host,
    user: routerConfig.user,
    password: routerConfig.password,
    port: routerConfig.port,
    timeout: 10 // مهلة أقصاها 10 ثوانٍ لمنع الـ Hang
  });

  try {
    await client.connect();
    const code = `${prefix}_${generateRandomCode()}`;

    // إضافة الكارت في نظام Hotspot Users كمثال افتراضي (أو User-Manager حسب إعداداتك)
    const result = await client.menu("/ip/hotspot/user").add({
      name: code,
      password: code,
      profile: "default",
      comment: "Hikayat-Auto-Generated"
    });

    await client.close();
    return { success: true, code: code };
  } catch (err) {
    try { await client.close(); } catch (e) {}
    console.error(`❌ خطأ في إنشاء كارت الميكروتيك (${routerConfig.host}):`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { createCardOnly };
