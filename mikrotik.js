const { RouterOSClient } = require('routeros-client');

async function disableUserQueue(username) {
    if (!username) {
        return { success: false, error: 'اسم المستخدم غير موجود' };
    }

    // تنظيف اسم المستخدم من علامة @ والدومين إن وجدت
    const atPos = username.indexOf('@');
    const cleanUser = atPos > 0 ? username.substring(0, atPos) : username;
    const queueName = `<hotspot-${cleanUser}>`;

    const client = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT || '8728'),
        timeout: 10
    });

    try {
        const api = await client.connect();

        // البحث عن الكيوز الخاص بالعميل
        const queues = await api.menu('/queue/simple').where('name', queueName).get();

        if (!queues || queues.length === 0) {
            await client.close();
            return { success: false, error: `الكيوز غير موجود: ${queueName}` };
        }

        // تعطيل الكيوز (إغلاق التحديد للسرعة العالية)
        await api.menu('/queue/simple').where('.id', queues[0]['.id']).set({ disabled: 'yes' });

        await client.close();
        return { success: true, message: `تم تعطيل الكيوز بنجاح: ${queueName}` };
    } catch (error) {
        console.error('MikroTik API Error:', error);
        return { success: false, error: 'تعذر الاتصال بالراوتر' };
    }
}

module.exports = { disableUserQueue };
