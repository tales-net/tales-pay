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

    // تنظيف username
    const atPos = username.indexOf('@');

    const cleanUser =
        atPos > 0
            ? username.substring(0, atPos)
            : username;

    // منع أي قيم غير متوقعة
    if (!cleanUser || cleanUser.length === 0) {
        return {
            success: false,
            status: 'INVALID_USER',
            error: 'اسم المستخدم غير صالح'
        };
    }

    // الـ Queue المطلوبة فقط
    const targetQueueName = `<hotspot-${cleanUser}>`;

    console.log('');
    console.log('========================================');
    console.log('🚀 [HIGH SPEED REQUEST]');
    console.log(`👤 USER       : ${cleanUser}`);
    console.log(`🎯 TARGET     : ${targetQueueName}`);
    console.log('========================================');

    const client = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT || '9595'),
        timeout: 10
    });

    try {

        // الاتصال
        await client.connect();

        console.log('✅ [MikroTik] تم الاتصال بنجاح');

        const queueMenu = client.menu('/queue/simple');

        /*
         * مهم جدًا:
         * نبحث عن Queue واحدة فقط بالاسم الكامل.
         *
         * لا نبحث باسم المستخدم وحده.
         * لا نستخدم find عام قد يؤدي إلى Queue أخرى.
         */

        const queues = await queueMenu.get();

        const matchedQueue = queues.find(q => {
            return q.name === targetQueueName;
        });

        /*
         * لا توجد Queue
         *
         * هذا يعني أن السرعة العالية مفعلة بالفعل
         * لأننا نحذف الـ Queue عند التفعيل.
         */

        if (!matchedQueue) {

            console.log(
                `⚡ [HIGH SPEED] لا توجد Queue للمستخدم ${cleanUser}`
            );

            console.log(
                `ℹ️ [HIGH SPEED] المستخدم بالفعل على السرعة العالية جداً`
            );

            return {
                success: true,
                status: 'ALREADY_HIGH_SPEED',
                username: cleanUser,
                queue: targetQueueName,
                message: `المستخدم ${cleanUser} بالفعل على السرعة العالية جداً`
            };
        }

        /*
         * وجدنا Queue المطلوبة بالضبط
         */

        const queueId = matchedQueue['.id'];

        console.log(`🎯 [QUEUE FOUND] ${matchedQueue.name}`);
        console.log(`🆔 [QUEUE ID] ${queueId}`);

        /*
         * حماية إضافية:
         * لا نحذف إلا إذا كان الاسم مطابقًا 100%
         */

        if (matchedQueue.name !== targetQueueName) {

            console.log(
                `🛑 [SAFETY] تم إيقاف العملية: Queue غير مطابقة`
            );

            return {
                success: false,
                status: 'QUEUE_MISMATCH',
                error: 'اسم الـ Queue غير مطابق'
            };
        }

        /*
         * حذف Queue الخاصة بهذا المستخدم فقط
         */

        await queueMenu.remove(queueId);

        console.log(
            `🚀 [SUCCESS] تم حذف Queue الخاصة بالمستخدم ${cleanUser}`
        );

        console.log(
            `⚡ [HIGH SPEED] السرعة العالية جداً مفعلة الآن`
        );

        return {
            success: true,
            status: 'HIGH_SPEED_ENABLED',
            username: cleanUser,
            queue: targetQueueName,
            queueId: queueId,
            message: `تم تفعيل السرعة العالية جداً للمستخدم ${cleanUser}`
        };

    } catch (error) {

        console.error(
            '❌ [MikroTik] خطأ:',
            error.message || error
        );

        return {
            success: false,
            status: 'MIKROTIK_ERROR',
            username: cleanUser,
            error: `فشل تنفيذ العملية: ${error.message || error}`
        };

    } finally {

        /*
         * إغلاق الاتصال دائمًا
         */

        try {
            await client.close();
            console.log('🔌 [MikroTik] تم إغلاق الاتصال');
        } catch (closeError) {
            console.log(
                '⚠️ [MikroTik] تعذر إغلاق الاتصال:',
                closeError.message || closeError
            );
        }
    }
}

module.exports = {
    disableUserQueue
};
