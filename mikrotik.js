const { RouterOSClient } = require('routeros-client');

async function disableUserQueue(username) {
    if (!username) {
        console.log('❌ [MikroTik] اسم المستخدم غير موجود في الطلب');
        return { success: false, error: 'اسم المستخدم غير موجود' };
    }

    // تنظيف اسم المستخدم من أي امتداد (@speed_high إلخ)
    const atPos = username.indexOf('@');
    const cleanUser = atPos > 0 ? username.substring(0, atPos) : username;

    console.log(`🔄 [MikroTik] محاولة تشغيل السكربت للمستخدم: ${cleanUser}...`);

    const client = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT || '8728'),
        timeout: 10
    });

    try {
        const api = await client.connect();
        console.log('✅ [MikroTik] تم الاتصال بالمايكروتك بنجاح');

        const scriptMenu = api.menu('/system/script');

        // اسم سكربت مؤقت لتمرير المتغير وتشغيل السكربت الأصلي
        const tempScriptName = `run_exec_${Date.now()}`;
        const sourceCode = `:global targetUser "${cleanUser}"; /system script run disable_user_queue;`;

        // 1. إنشاء أمر التشغيل المؤقت
        await scriptMenu.add({
            name: tempScriptName,
            source: sourceCode
        });

        // 2. تنفيذ السكربت
        await scriptMenu.where('name', tempScriptName).exec('run');
        console.log(`🚀 [MikroTik] تم تنفيذ السكربت disable_user_queue بنجاح للمستخدم: ${cleanUser}`);

        // 3. مسح الأمر المؤقت للحفاظ على نظافة السكربتات
        await scriptMenu.where('name', tempScriptName).remove();

        await client.close();
        return { success: true, message: `تم تعطيل الكيوز للمستخدم ${cleanUser} عبر السكربت` };

    } catch (error) {
        console.error('❌ [MikroTik] خطأ أثناء تنفيذ السكربت:', error.message || error);
        try { await client.close(); } catch (e) {}
        return { success: false, error: `فشل تنفيذ السكربت: ${error.message}` };
    }
}

module.exports = { disableUserQueue };
