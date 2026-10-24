const { RouterOSClient } = require('routeros-client');

// جلب إعدادات الميكروتك حسب الفرع أو الدومين من متغيرات البيئة
function getBranchConfig(branch, domain) {
  const b = (branch || '').toLowerCase().trim();
  const d = (domain || '').toLowerCase().trim();

  // تحديد مفتاح الفرع بدقة
  let key = 'main';
  if (b === 'branch2' || d.includes('branch2') || d.includes('net2')) {
    key = 'branch2';
  } else if (b === 'branch3' || d.includes('branch3') || d.includes('net3')) {
    key = 'branch3';
  } else if (b === 'main' || d.includes('main') || d.includes('net1') || d.includes('tales1')) {
    key = 'main';
  }

  // الإعدادات العامة الافتراضية
  let host = process.env.MIKROTIK_HOST;
  let user = process.env.MIKROTIK_USER;
  let password = process.env.MIKROTIK_PASSWORD;
  let port = process.env.MIKROTIK_PORT || '8728';

  // تخصيص الإعدادات إذا كانت محددة لكل فرع في .env
  if (key === 'branch2') {
    host = process.env.MIKROTIK_HOST_BRANCH2 || host;
    user = process.env.MIKROTIK_USER_BRANCH2 || user;
    password = process.env.MIKROTIK_PASSWORD_BRANCH2 || password;
    port = process.env.MIKROTIK_PORT_BRANCH2 || port;
  } else if (key === 'branch3') {
    host = process.env.MIKROTIK_HOST_BRANCH3 || host;
    user = process.env.MIKROTIK_USER_BRANCH3 || user;
    password = process.env.MIKROTIK_PASSWORD_BRANCH3 || password;
    port = process.env.MIKROTIK_PORT_BRANCH3 || port;
  }

  // في حال لم يتوفر Host للفرع وتم تمرير الدومين من الصفحة
  if (!host && domain) {
    host = domain;
  }

  return {
    branchKey: key,
    host: host,
    user: user,
    password: password,
    port: parseInt(port)
  };
}

async function disableUserQueue(username, branch = 'main', domain = '') {
  if (!username) {
    console.log('❌ [MikroTik] اسم المستخدم غير موجود في الطلب');
    return { success: false, error: 'اسم المستخدم غير موجود' };
  }

  // تنظيف اسم المستخدم من أي امتداد مثل @ أو فراغات
  const atPos = username.indexOf('@');
  const cleanUser = (atPos > 0 ? username.substring(0, atPos) : username).trim();

  const config = getBranchConfig(branch, domain);
  console.log(`🔄 [MikroTik] معالجة الكارت: ${cleanUser} | الفرع المستهدف: ${config.branchKey} | Host: ${config.host}:${config.port}...`);

  if (!config.host || !config.user) {
    return { success: false, error: `بيانات الاتصال بالميكروتك للفرع (${config.branchKey}) غير مكتملة في env` };
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
    console.log(`✅ [MikroTik] تم الاتصال بسيرفر (${config.branchKey} - ${config.host}) بنجاح`);

    const scriptMenu = api.menu('/system/script');

    // كود السكربت لإلغاء Queue المستخدم
    const updatedSource = `:local u "${cleanUser}";\n:local qName ("<hotspot-" . $u . ">");\n:local qId [/queue simple find name=$qName];\n:if ([:len $qId] > 0) do={\n    /queue simple disable $qId;\n    :log info ("Queue disabled successfully for user: " . $u);\n}`;

    // 1. تحديث محتوى السكربت
    await scriptMenu.where('name', 'disable_user_queue').set({
      source: updatedSource
    });

    // 2. تشغيل السكربت
    await scriptMenu.exec('run', { number: 'disable_user_queue' });

    console.log(`🚀 [MikroTik] تم فتح السرعة للمستخدم: ${cleanUser} على فرع: ${config.branchKey}`);

    await client.close();
    return { success: true, message: `تم تفعيل السرعة العالية للمستخدم ${cleanUser} بنجاح على فرع ${config.branchKey}` };

  } catch (error) {
    console.error(`❌ [MikroTik] خطأ أثناء التنفيذ على فرع ${config.branchKey}:`, error.message || error);
    try { await client.close(); } catch (e) {}
    return { success: false, error: `فشل التنفيذ على سيرفر ${config.branchKey}: ${error.message}` };
  }
}

module.exports = { disableUserQueue };
