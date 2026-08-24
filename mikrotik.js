const { RouterOSClient } = require('routeros-client');

// إعدادات الاتصال بكل سيرفر ميكروتك حسب الفرع
function getBranchConfig(branch) {
  const b = (branch || 'main').toLowerCase();

  if (b === 'branch2') {
    return {
      host: process.env.MIKROTIK_HOST_BRANCH2 || process.env.MIKROTIK_HOST,
      user: process.env.MIKROTIK_USER_BRANCH2 || process.env.MIKROTIK_USER,
      password: process.env.MIKROTIK_PASSWORD_BRANCH2 || process.env.MIKROTIK_PASSWORD,
      port: parseInt(process.env.MIKROTIK_PORT_BRANCH2 || process.env.MIKROTIK_PORT || '8728')
    };
  }

  if (b === 'branch3') {
    return {
      host: process.env.MIKROTIK_HOST_BRANCH3 || process.env.MIKROTIK_HOST,
      user: process.env.MIKROTIK_USER_BRANCH3 || process.env.MIKROTIK_USER,
      password: process.env.MIKROTIK_PASSWORD_BRANCH3 || process.env.MIKROTIK_PASSWORD,
      port: parseInt(process.env.MIKROTIK_PORT_BRANCH3 || process.env.MIKROTIK_PORT || '8728')
    };
  }

  // الفرع الرئيسي (main) أو الافتراضي
  return {
    host: process.env.MIKROTIK_HOST,
    user: process.env.MIKROTIK_USER,
    password: process.env.MIKROTIK_PASSWORD,
    port: parseInt(process.env.MIKROTIK_PORT || '8728')
  };
}

async function disableUserQueue(username, branch = 'main') {
  if (!username) {
    console.log('❌ [MikroTik] اسم المستخدم غير موجود في الطلب');
    return { success: false, error: 'اسم المستخدم غير موجود' };
  }

  // تنظيف اسم المستخدم من أي امتداد
  const atPos = username.indexOf('@');
  const cleanUser = atPos > 0 ? username.substring(0, atPos) : username;

  const config = getBranchConfig(branch);
  console.log(`🔄 [MikroTik] معالجة الكارت: ${cleanUser} | الفرع: ${branch} | IP السيرفر: ${config.host}...`);

  if (!config.host || !config.user) {
    return { success: false, error: `بيانات الاتصال بالميكروتك للفرع ${branch} غير مكتملة` };
  }

  const client = new RouterOSClient({
    host: config.host,
    user: config.user,
    password: config.password,
    port: config.port,
    timeout: 10
  });

  try {
    const api = await client.connect();
    console.log(`✅ [MikroTik] تم الاتصال بالسيرفر (${config.host}) بنجاح`);

    const scriptMenu = api.menu('/system/script');

    // كود السكربت بحساب المستخدم
    const updatedSource = `:local u "${cleanUser}";\n:local qName ("<hotspot-" . $u . ">");\n:local qId [/queue simple find name=$qName];\n:if ([:len $qId] > 0) do={\n    /queue simple disable $qId;\n    :log info ("Queue disabled successfully for user: " . $u);\n}`;

    // 1. تحديث محتوى السكربت
    await scriptMenu.where('name', 'disable_user_queue').set({
      source: updatedSource
    });

    // 2. تشغيل السكربت
    await scriptMenu.exec('run', { number: 'disable_user_queue' });

    console.log(`🚀 [MikroTik] تم تنفيذ السكربت بنجاح للمستخدم: ${cleanUser} على فرع: ${branch}`);

    await client.close();
    return { success: true, message: `تم تعطيل الكيوز للمستخدم ${cleanUser} بنجاح` };

  } catch (error) {
    console.error(`❌ [MikroTik] خطأ أثناء التنفيذ على فرع ${branch}:`, error.message || error);
    try { await client.close(); } catch (e) {}
    return { success: false, error: `فشل التنفيذ: ${error.message}` };
  }
}

module.exports = { disableUserQueue };
