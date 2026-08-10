const { RouterOSClient } = require('routeros-client');

async function disableUserQueue(username) {

    if (!username) {
        console.log('❌ [MikroTik] اسم المستخدم غير موجود');

        return {
            success: false,
            status: 'INVALID_USER',
            error: 'اسم المستخدم غير موجود'
        };
    }

    // تنظيف اسم المستخدم
    const atPos = username.indexOf('@');

    const cleanUser =
        atPos > 0
            ? username.substring(0, atPos)
            : username;

    if (!cleanUser) {
        return {
            success: false,
            status: 'INVALID_USER',
            error: 'اسم المستخدم غير صالح'
        };
    }

    // Queue الخاصة بهذا المستخدم فقط
    const targetQueueName = `<hotspot-${cleanUser}>`;

    console.log('');
    console.log('========================================');
    console.log('🚀 HIGH SPEED REQUEST');
    console.log('USER  = ' + cleanUser);
    console.log('QUEUE = ' + targetQueueName);
    console.log('========================================');

    const client = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT || '8728'),
        timeout: 10
    });

    try {

        // الاتصال
        const api = await client.connect();

        console.log('✅ [MikroTik] Connected');

        // الوصول إلى Simple Queue
        const queueMenu = api.menu('/queue/simple');

        // قراءة الكيوز
        const queues = await queueMenu.get();

        // البحث بالاسم الكامل فقط
        const matchedQueue = queues.find(
            q => q.name === targetQueueName
        );

        // ----------------------------------
        // الكيوز غير موجودة
        // ----------------------------------

        if (!matchedQueue) {

            console.log(
                `⚡ [HIGH SPEED] Queue غير موجودة: ${targetQueueName}`
            );

            console.log(
                `🚀 المستخدم ${cleanUser} بالفعل على السرعة العالية جداً`
            );

            return {
                success: true,
                status: 'ALREADY_HIGH_SPEED',
                username: cleanUser,
                queue: targetQueueName,
                message:
                    `المستخدم ${cleanUser} بالفعل على السرعة العالية جداً`
            };
        }

        // ----------------------------------
        // وجدنا الكيوز
        // ----------------------------------

        const queueId = matchedQueue['.id'];

        console.log(
            `🎯 Queue FOUND: ${matchedQueue.name}`
        );

        console.log(
            `🆔 Queue ID: ${queueId}`
        );

        // حماية إضافية
        if (matchedQueue.name !== targetQueueName) {

            return {
                success: false,
                status: 'QUEUE_MISMATCH',
                error: 'اسم Queue غير مطابق'
            };
        }

        // ----------------------------------
        // حذف Queue واحدة فقط
        // ----------------------------------

        await queueMenu.remove(queueId);

        console.log(
            `🚀 تم حذف Queue للمستخدم: ${cleanUser}`
        );

        console.log(
            `⚡ السرعة العالية جداً مفعلة`
        );

        return {
            success: true,
            status: 'HIGH_SPEED_ENABLED',
            username: cleanUser,
            queue: targetQueueName,
            queueId: queueId,
            message:
                `تم تفعيل السرعة العالية جداً للمستخدم ${cleanUser}`
        };

    } catch (error) {

        console.error(
            '❌ [MikroTik] فشل التنفيذ:',
            error.message || error
        );

        return {
            success: false,
            status: 'MIKROTIK_ERROR',
            username: cleanUser,
            error:
                `فشل تنفيذ العملية: ${error.message || error}`
        };

    } finally {

        try {
            await client.close();
            console.log('🔌 [MikroTik] Connection closed');
        } catch (e) {
            console.log(
                '⚠️ تعذر إغلاق الاتصال:',
                e.message || e
            );
        }
    }
}

module.exports = {
    disableUserQueue
};
