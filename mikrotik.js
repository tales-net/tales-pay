const { RouterOSClient } = require('routeros-client');

async function disableUserQueue(username) {
    if (!username) {
        console.log('❌ [MikroTik] اسم المستخدم غير موجود في الطلب');
        return { success: false, error: 'اسم المستخدم غير موجود' };
    }

    // تنظيف اسم المستخدم من أي امتداد (@speed_high إلخ)
    const atPos = username.indexOf('@');
    const cleanUser = atPos > 0 ? username.substring(0, atPos) : username;

    console.log(`🔄 [MikroTik] معالجة الكارت: ${cleanUser}...`);

    const client = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT || '9595'),
        timeout: 10
    });

    try {
        const api = await client.connect();
        console.log('✅ [MikroTik] تم الاتصال بالسيرفر بنجاح');

        const scriptMenu = api.menu('/system/script');

        // كود السكربت المحدث بحساب المستخدم الجديد
        const updatedSource = `:local u "${cleanUser}";\n:local qName ("<hotspot-" . $u . ">");\n:local qId [/queue simple find name=$qName];\n:if ([:len $qId] > 0) do={\n    /queue simple disable $qId;\n    :log info ("Queue disabled successfully for user: " . $u);\n}`;

        // 1. تحديث محتوى السكربت الأصلي disable_user_queue
        await scriptMenu.where('name', 'disable_user_queue').set({
            source: updatedSource
        });

        console.log(`📌 [MikroTik] تم تحديث السكربت disable_user_queue للمستخدم: ${cleanUser}`);

        // 2. تشغيل السكربت باستخدام صيغة number المتوافقة مع v5.26
        await scriptMenu.exec('run', { number: 'disable_user_queue' });

        console.log(`🚀 [MikroTik] تم تنفيذ السكربت بنجاح للمستخدم: ${cleanUser}`);

        await client.close();
        return { success: true, message: `تم تعطيل الكيوز للمستخدم ${cleanUser} بنجاح` };

    } catch (error) {
        console.error('❌ [MikroTik] خطأ أثناء التنفيذ:', error.message || error);
        try { await client.close(); } catch (e) {}
        return { success: false, error: `فشل التنفيذ: ${error.message}` };
    }
}

module.exports = { disableUserQueue };
