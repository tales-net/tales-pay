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

    console.log(`🔄 [MikroTik] محاولة فتح السرعة للمستخدم: ${cleanUser}...`);

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

        const queueMenu = api.menu('/queue/simple');
        const queues = await queueMenu.get();

        // البحث عن الكيوز الخاص بالكارت
        const matchedQueue = queues.find(q => 
            q.name === targetQueueName || 
            q.name === `<hotspot-${cleanUser}>` ||
            q.name === cleanUser
        );

        if (!matchedQueue) {
            console.log(`⚠️ [MikroTik] لم يتم العثور على كيوز باسم: ${targetQueueName}`);
            await client.close();
            return { success: false, error: `الكيوز غير موجود: ${targetQueueName}` };
        }

        console.log(`📌 [MikroTik] وجدنا الكيوز: ${matchedQueue.name} (ID: ${matchedQueue['.id']})`);

        // إلغاء تقييد السرعة عبر حذف/تعطيل الكيوز الديناميكي (Dynamic Queue)
        try {
            await queueMenu.remove(matchedQueue['.id']);
            console.log(`🚀 [MikroTik] تم إزالة الكيوز الديناميكي بنجاح وانطلقت السرعة العالية: ${matchedQueue.name}`);
        } catch (removeErr) {
            // كخيار احتياطي في حال عدم قبول الحذف
            await queueMenu.where('.id', matchedQueue['.id']).exec('disable');
            console.log(`🚀 [MikroTik] تم تعطيل الكيوز الديناميكي بنجاح: ${matchedQueue.name}`);
        }

        await client.close();
        return { success: true, message: `تم فتح السرعة العالية للمستخدم ${cleanUser}` };

    } catch (error) {
        console.error('❌ [MikroTik] خطأ أثناء تنفيذ العملية:', error.message || error);
        try { await client.close(); } catch (e) {}
        return { success: false, error: `فشل التنفيذ: ${error.message}` };
    }
}

module.exports = { disableUserQueue };
