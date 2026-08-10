const { RouterOSClient } = require('routeros-client');

async function disableUserQueues(username) {
    if (!username) {
        console.log('❌ [MikroTik] اسم المستخدم غير موجود في الطلب');
        return { success: false, error: 'اسم المستخدم غير موجود' };
    }

    // قص الاسم الأساسي قبل أي suffix
    const atPos = username.indexOf('@');
    const cleanUser = atPos > 0 ? username.substring(0, atPos) : username;

    console.log(`🔄 [MikroTik] محاولة الاتصال بالراوتر: ${process.env.MIKROTIK_HOST}:${process.env.MIKROTIK_PORT || 8728}...`);

    const client = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT || '8728'),
        timeout: 10,
        secure: false // مهم للإصدارات القديمة زي 5.26
    });

    try {
        const api = await client.connect();
        console.log('✅ [MikroTik] تم الاتصال بالمايكروتك بنجاح!');

        // جلب قائمة الكيوز
        const queues = await api.menu('/queue/simple').get();
        console.log('📋 [MikroTik] جميع الكيوز الموجودة:', queues.map(q => q.name));

        // البحث عن كل الكيوز اللي تبدأ بـ <hotspot-cleanUser
        const matchedQueues = queues.filter(q =>
            q.name.startsWith(`<hotspot-${cleanUser}`)
        );

        if (matchedQueues.length === 0) {
            console.log(`⚠️ [MikroTik] لم يتم العثور على أي كيوز يبدأ بـ: <hotspot-${cleanUser}>`);
            await client.close();
            return { success: false, error: `لا يوجد كيوز للمستخدم: ${cleanUser}` };
        }

        // تعطيل كل الكيوز المطابقة
        for (const q of matchedQueues) {
            console.log(`📌 [MikroTik] تعطيل الكيوز: ${q.name} (ID: ${q['.id']})`);
            await api.menu('/queue/simple').where('.id', q['.id']).exec('disable');
            console.log(`🚀 [MikroTik] تم تعطيل الكيوز بنجاح: ${q.name}`);
        }

        await client.close();
        return { success: true, message: `تم تعطيل ${matchedQueues.length} كيوز للمستخدم ${cleanUser}` };

    } catch (error) {
        console.error('❌ [MikroTik] فشل الاتصال أو التنفيذ:', error.message || error);
        try { await client.close(); } catch (e) {}
        return { success: false, error: `تعذر الاتصال بالمايكروتك: ${error.message}` };
    }
}

module.exports = { disableUserQueues };
