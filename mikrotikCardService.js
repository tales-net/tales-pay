const { RouterOSClient } = require("routeros-client");

function generateCardCode(prefix, randomLength = 8) {
  const chars = "0123456789";
  let result = prefix;
  for (let i = 0; i < randomLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * إضافة الكارت فقط في اليوزر مانجر
 */
async function createCardOnly(routerConfig, prefix, transactionId = "") {
  let cardCode = "";
  let isCreated = false;
  let attempts = 0;
  const maxAttempts = 5;

  while (!isCreated && attempts < maxAttempts) {
    attempts++;
    cardCode = generateCardCode(prefix);

    const client = new RouterOSClient({
      host: routerConfig.host,
      user: routerConfig.user,
      password: routerConfig.password,
      port: routerConfig.port,
      timeout: 10
    });

    try {
      const api = await client.connect();
      console.log(`👤 [User-Manager] محاولة إضافة الكارت: ${cardCode}`);

      const addUserCommand = [
        "/tool/user-manager/user/add",
        `=username=${cardCode}`,
        `=password=${cardCode}`,
        `=customer=admin`
      ];

      if (typeof client.write === "function") {
        await client.write(addUserCommand);
      } else if (typeof api.write === "function") {
        await api.write(addUserCommand);
      } else {
        await api.menu("/tool/user-manager/user").add({
          username: cardCode,
          password: cardCode,
          customer: "admin"
        });
      }

      await client.close().catch(() => {});
      isCreated = true;
    } catch (error) {
      if (client) await client.close().catch(() => {});
      const errStr = error.message || "";
      if (errStr.includes("already exists") || errStr.includes("such username already exists")) {
        console.warn(`⚠️ الكود ${cardCode} موجود مسبقاً، جاري تجربة رقم آخر...`);
        continue;
      } else {
        throw error;
      }
    }
  }

  if (!isCreated) {
    throw new Error("فشل توليد كود فريد بعد عدة محاولات.");
  }

  return cardCode;
}

module.exports = { createCardOnly, generateCardCode };
