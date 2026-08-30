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
 * إضافة الكارت في اليوزر مانجر مع التحقق التام من عدم التكرار
 * وإذا تم اكتشاف رقم مماثل، يتم توليد رقم آخر تلقائياً دون تفعيل البروفايل على القديم
 */
async function createCardOnly(routerConfig, prefix, transactionId = "") {
  let cardCode = "";
  let isCreated = false;
  let attempts = 0;
  const maxAttempts = 10; // زيادة عدد المحاولات للأمان التام

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
      console.log(`👤 [User-Manager] محاولة إنشاء كارت جديد (محاولة ${attempts}): ${cardCode}`);

      const addUserCommand = [
        "/tool/user-manager/user/add",
        `=username=${cardCode}`,
        `=password=${cardCode}`,
        `=customer=admin`
      ];

      // تنفيذ أمر الإضافة والتأكد من نجاحه وعدم وجود تكرار
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
      isCreated = true; // تم إنشاء الكارت الفريد بنجاح تام ولن يتم لمس أي كارت قديم
      console.log(`✅ تم التأكد من فريدة الكارت وإنشائه بنجاح: ${cardCode}`);

    } catch (error) {
      if (client) await client.close().catch(() => {});
      const errStr = error.message || "";
      
      // إذا كان الخطأ بسبب أن الكارت موجود مسبقاً، نتجاهله ونستمر في توليد رقم جديد تماماً
      if (errStr.includes("already exists") || errStr.includes("such username already exists")) {
        console.warn(`⚠️ الكود ${cardCode} موجود مسبقاً في النظام، جاري توليد كارت آخر تفادياً لأي خطأ...`);
        continue; 
      } else {
        // إذا كان خطأ تقني آخر غير التكرار، نقوم بإيقافه وإظهار الخطأ
        throw error;
      }
    }
  }

  if (!isCreated) {
    throw new Error("فشل توليد كود كارت فريد بعد عدة محاولات.");
  }

  return cardCode;
}

module.exports = { createCardOnly, generateCardCode };
