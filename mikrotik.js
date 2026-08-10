const { RouterOSClient } = require('routeros-client');

async function disableUserQueue(username) {
    if (!username) {
        console.log('❌ [MikroTik] اسم المستخدم غير موجود في الطلب');
        return { success: false, error: 'اسم المستخدم غير موجود' };
    }

    // تنظيف اسم المستخدم من أي امتداد (@speed_high إلخ)
    const atPos = username.indexOf('@');
    const cleanUser = atPos > 0 ? username.substring(0, atPos) : username;
    const targetQueueName = `<hotspot-${cleanUser}>`;

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

        const queueMenu = api.menu('/queue/simple');
        
        // جلب جميع الكيوز للبحث
        const queues = await queueMenu.get();
        const matchedQueue = queues.find(q => q.name === targetQueueName || q.name === cleanUser);

        if (!matchedQueue) {
            console.log(`⚠️ [MikroTik] لم يتم العثور على كيوز باسم: ${targetQueueName}`);
            await client.close();
            return { success: false, error: `الكيوز غير موجود: ${targetQueueName}` };
        }

        console.log(`📌 [MikroTik] وجدنا الكيوز: ${matchedQueue.name} (ID: ${matchedQueue['.id']})`);

        // تنفيذ التعطيل الصحيح الخاص بمكتبة routeros-client
        await queueMenu.where('.id', matchedQueue['.id']).set({ disabled: 'yes' });

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
