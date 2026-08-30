const { RouterOSClient } = require("routeros-client");

const BRANCH_ROUTERS = {
  main: {
    host: process.env.MIKROTIK_HOST || "192.168.1.1",
    user: process.env.MIKROTIK_USER || "admin",
    password: process.env.MIKROTIK_PASSWORD || "",
    port: parseInt(process.env.MIKROTIK_PORT || "8728")
  },
  branch2: {
    host: process.env.MIKROTIK_HOST_BRANCH2 || "192.168.2.1",
    user: process.env.MIKROTIK_USER || "admin",
    password: process.env.MIKROTIK_PASSWORD || "",
    port: parseInt(process.env.MIKROTIK_PORT || "8728")
  },
  branch3: {
    host: process.env.MIKROTIK_HOST_BRANCH3 || "192.168.3.1",
    user: process.env.MIKROTIK_USER || "admin",
    password: process.env.MIKROTIK_PASSWORD || "",
    port: parseInt(process.env.MIKROTIK_PORT || "8728")
  }
};

function getCardPrefixAndType(amount) {
  const numAmount = Number(amount);
  switch (numAmount) {
    case 5:
      return { prefix: "01", profile: "Bronze", packageName: "الباقة البرونزية", isCustom: false };
    case 15:
      return { prefix: "02", profile: "Silver", packageName: "الباقة الفضية", isCustom: false };
    case 30:
      return { prefix: "05", profile: "Gold", packageName: "الباقة الذهبية", isCustom: false };
    case 50:
      return { prefix: "10", profile: "Platinum", packageName: "الباقة البلاتينية", isCustom: false };
    case 100:
      return { prefix: "25", profile: "Diamond", packageName: "الباقة الماسية", isCustom: false };
    default:
      return { prefix: "", profile: "", packageName: "", isCustom: true };
  }
}

function generateCardCode(prefix, randomLength = 6) {
  const chars = "0123456789";
  let result = prefix;
  for (let i = 0; i < randomLength; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function processPaymentAndCreateCard(amount, branchKey = "main", transactionId = "") {
  const cardInfo = getCardPrefixAndType(amount);

  if (cardInfo.isCustom) {
    return {
      success: true,
      isCustomAmount: true,
      amount: amount,
      message: "🌸 بالتوفيق لكم وبارك الله فيكم!"
    };
  }

  const targetBranch = BRANCH_ROUTERS[branchKey] ? branchKey : "main";
  const routerConfig = BRANCH_ROUTERS[targetBranch];

  const client = new RouterOSClient({
    host: routerConfig.host,
    user: routerConfig.user,
    password: routerConfig.password,
    port: routerConfig.port,
    timeout: 10
  });

  let cardCode = "";
  let isCreated = false;
  let attempts = 0;
  const maxAttempts = 5;

  try {
    const api = await client.connect();

    while (!isCreated && attempts < maxAttempts) {
      attempts++;
      cardCode = generateCardCode(cardInfo.prefix);

      try {
        // 1. إضافة المستخدم أولاً باستخدام List (نفس الطريقة المباشرة)
        await api.menu("/tool/user-manager/user").add({
          username: cardCode,
          password: cardCode,
          customer: "admin"
        });

        // 2. تفعيل البروفايل عن طريق تمرير القائمة (List) للأمر مباشرة
        const activateCommand = [
          "/tool/user-manager/user/create-and-activate-profile",
          `=user=${cardCode}`,
          `=profile=${cardInfo.profile}`,
          `=customer=admin`
        ];

        // التحقق من الطريقة المتاحة لتنفيذ القائمة في العميل
        if (typeof api.write === "function") {
          await api.write(activateCommand);
        } else if (typeof client.write === "function") {
          await client.write(activateCommand);
        } else {
          // طريقة بديلة لتنفيذ السكريبت أو القائمة كـ Run
          await api.menu("/tool/user-manager/user").add({
            command: "create-and-activate-profile",
            user: cardCode,
            profile: cardInfo.profile,
            customer: "admin"
          });
        }

        isCreated = true;
      } catch (addError) {
        if (addError.message && (addError.message.includes("already exists") || addError.message.includes("already"))) {
          continue;
        } else {
          // محاولة أخيرة عبر الـ Hotspot العادي كخطط بديلة
          try {
            await api.menu("/ip/hotspot/user").add({
              name: cardCode,
              password: cardCode,
              profile: cardInfo.profile,
              comment: `Paymob TXN: ${transactionId} | Branch: ${targetBranch}`
            });
            isCreated = true;
          } catch (hotspotError) {
            throw addError;
          }
        }
      }
    }

    await client.close();

    if (!isCreated) {
      throw new Error("فشل توليد كود فريد بعد عدة محاولات.");
    }

    return {
      success: true,
      isCustomAmount: false,
      cardCode: cardCode,
      amount: amount,
      packageName: cardInfo.packageName,
      profile: cardInfo.profile,
      branchKey: targetBranch
    };

  } catch (error) {
    if (client) await client.close().catch(() => {});
    return {
      success: false,
      error: `تعذر توليد الكارت تلقائياً: ${error.message}`
    };
  }
}

module.exports = {
  processPaymentAndCreateCard,
  getCardPrefixAndType,
  BRANCH_ROUTERS
};
