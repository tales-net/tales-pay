const { RouterOSClient } = require('routeros-client');

async function disableUserQueue(username) {
    if (!username) {
        return { success: false, error: 'اسم المستخدم غير موجود' };
    }

    // تنظيف اسم المستخدم
    const atPos = username.indexOf('@');
    const cleanUser = atPos > 0 ? username.substring(0, atPos) : username;

    console.log(`🔄 [MikroTik API] تشغيل السكربت للمستخدم: ${cleanUser}`);

    const client = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT || '8728'),
        timeout: 10
    });

    try {
        const api = await client.connect();

        // 1. تمرير اسم المستخدم للمتغير العام بداخل المايكروتك
        await api.write('/system/script/environment/set', [
            `=name=targetUser`,
            `=value=${cleanUser}`
        ]);

        // 2. تشغيل السكربت disable_user_queue
        await api.write('/system/script/run', [
            `=.id=disable_user_queue`
        ]);

        console.log(`🚀 [MikroTik API] تم تنفيذ السكربت بنجاح للمستخدم: ${cleanUser}`);

        await client.close();
        return { success: true, message: `تم تفعيل السرعة العالية للمستخدم ${cleanUser}` };

    } catch (error) {
        console.error('❌ [MikroTik API] خطأ أثناء تنفيذ السكربت:', error.message || error);
        try { await client.close(); } catch (e) {}
        return { success: false, error: `فشل التنفيذ عبر API: ${error.message}` };
    }
}

module.exports = { disableUserQueue };
