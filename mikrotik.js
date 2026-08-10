const { RouterOSClient } = require('routeros-client');

async function disableUserQueue(username) {
    if (!username) {
        console.log('❌ [MikroTik] اسم المستخدم غير موجود في الطلب');
        return { success: false, error: 'اسم المستخدم غير موجود' };
    }

    // قص الاسم الأساسي قبل أي suffix
    const atPos = username.indexOf('@');
    const cleanUser = atPos > 0 ? username.substring(0, atPos) : username;

    // احتمالات أسماء الكيوز
    const targetQueueName1 = `<hotspot-${cleanUser}>`;
    const targetQueueName2 = `hotspot-${cleanUser}`;
    const targetQueueName3 = cleanUser;

    console.log(`🔄 [MikroTik] محاولة الاتصال بالراوتر: ${process.env.MIKROTIK_HOST}:${process.env.MIKROTIK_PORT || 8728}...`);

    const client = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT || '8728'),
        timeout: 10
    });

    try {
        const api = await client.connect();
        console.log('✅ [MikroTik] تم الاتصال بالمايكروتك بنجاح!');

        // جلب قائمة الكيوز
        const queues = await api.menu('/queue/simple').get();

        // البحث عن الكيوز بأي شكل
        const matchedQueue = queues.find(q =>
            q.name === targetQueueName1 ||
            q.name === targetQueueName2 ||
            q.name === targetQueueName3
        );

        if (!matchedQueue) {
            console.log(`⚠️ [MikroTik] لم يتم العثور على كيوز باسم: ${targetQueueName1} أو ${targetQueueName2} أو ${targetQueueName3}`);
            await client.close();
            return { success: false, error: `الكيوز غير موجود: ${cleanUser}` };
        }

        console.log(`📌 [MikroTik] وجدنا الكيوز: ${matchedQueue.name} (ID: ${matchedQueue['.id']})`);

        // أمر تعطيل صريح متوافق مع RouterOS 5.26
        await api.write('/queue/simple/disable', ['=.id=' + matchedQueue['.id']]);
        console.log(`🚀 [MikroTik] تم تعطيل الكيوز بنجاح: ${matchedQueue.name}`);

        await client.close();
        return { success: true, message: `تم تعطيل الكيوز ${matchedQueue.name} بنجاح` };

    } catch (error) {
        console.error('❌ [MikroTik] فشل الاتصال أو التنفيذ:', error.message || error);
        try { await client.close(); } catch (e) {}
        return { success: false, error: `تعذر الاتصال بالمايكروتك: ${error.message}` };
    }
}

module.exports = { disableUserQueue };
