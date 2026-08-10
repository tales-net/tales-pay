const { RouterOSClient } = require('routeros-client');

async function disableUserQueue(username) {
    if (!username) {
        console.log('❌ خطأ: اسم المستخدم غير مرسل');
        return { success: false, error: 'اسم المستخدم غير موجود' };
    }

    // تنظيف اسم المستخدم من أي امتداد أو دومين (@speed_high إلخ)
    const atPos = username.indexOf('@');
    const cleanUser = atPos > 0 ? username.substring(0, atPos) : username;
    
    // الاسم المستهدف للكيوز
    const targetQueueName = `<hotspot-${cleanUser}>`;

    console.log(`🔍 جاري البحث عن الكيوز: "${targetQueueName}" للمستخدم: "${cleanUser}"...`);

    const client = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT || '8728'),
        timeout: 10
    });

    try {
        const api = await client.connect();

        // جلب قائمة الكيوز لبحث دقيق يتفادى مشاكل الرموز < > في v5.26
        const allQueues = await api.menu('/queue/simple').get();
        
        // البحث عن الكيوز المطابق
        const matchedQueue = allQueues.find(q => 
            q.name === targetQueueName || 
            q.name === `<hotspot-${cleanUser}>` ||
            q.name === cleanUser
        );

        if (!matchedQueue) {
            console.log(`⚠️ لم يتم العثور على الكيوز: ${targetQueueName}`);
            await client.close();
            return { success: false, error: `الكيوز غير موجود في المايكروتك: ${targetQueueName}` };
        }

        console.log(`✅ تم العثور على الكيوز: ${matchedQueue.name} (ID: ${matchedQueue['.id']})`);

        // تنفيذ أمر التعطيل الصريح المباشر (Disable)
        await api.menu('/queue/simple').where('.id', matchedQueue['.id']).exec('disable');

        console.log(`🚀 تم تعطيل الكيوز بنجاح: ${matchedQueue.name}`);

        await client.close();
        return { success: true, message: `تم تفعيل السرعة العالية وتعطيل الكيوز ${matchedQueue.name}` };

    } catch (error) {
        console.error('❌ خطأ في الاتصال بالمايكروتك:', error.message || error);
        try { await client.close(); } catch (e) {}
        return { success: false, error: `فشل الاتصال بالمايكروتك: ${error.message}` };
    }
}

module.exports = { disableUserQueue };
