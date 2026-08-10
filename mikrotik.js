const { RouterOSClient } = require('routeros-client');

async function disableUserQueue(username) {

    if (!username) {
        return {
            success: false,
            status: 'INVALID_USER',
            error: 'اسم المستخدم غير موجود'
        };
    }

    // استخراج اسم المستخدم بدون @speed_high
    const atPos = username.indexOf('@');

    const cleanUser =
        atPos > 0
            ? username.substring(0, atPos)
            : username;

    const targetQueueName = `<hotspot-${cleanUser}>`;

    console.log(
        `🔄 [MikroTik] البحث عن: ${targetQueueName}`
    );

    const client = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT || '8728'),
        timeout: 10
    });

    try {

        const api = await client.connect();

        const queueMenu = api.menu('/queue/simple');

        // البحث بالاسم الكامل فقط
        const queues = await queueMenu
            .where('name', targetQueueName)
            .get();

        // --------------------------------
        // لا توجد Queue
        // --------------------------------

        if (!queues || queues.length === 0) {

            console.log(
                `⚡ [HIGH SPEED] لا توجد Queue: ${targetQueueName}`
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

        // --------------------------------
        // تحديد Queue واحدة فقط
        // --------------------------------

        const targetQueue = queues[0];
        const targetId = targetQueue['.id'];

        console.log(
            `📌 [QUEUE FOUND] ${targetQueue.name}`
        );

        console.log(
            `🆔 [QUEUE ID] ${targetId}`
        );

        // حماية إضافية
        if (targetQueue.name !== targetQueueName) {

            return {
                success: false,
                status: 'QUEUE_MISMATCH',
                error: 'الـ Queue ليست Queue الخاصة بالمستخدم'
            };
        }

        // --------------------------------
        // إذا كانت Disabled بالفعل
        // --------------------------------

        if (
            targetQueue.disabled === 'true' ||
            targetQueue.disabled === true
        ) {

            console.log(
                `⚡ Queue بالفعل Disabled`
            );

            return {
                success: true,
                status: 'ALREADY_HIGH_SPEED',
                username: cleanUser,
                queue: targetQueueName,
                queueId: targetId,
                message:
                    `المستخدم ${cleanUser} بالفعل على السرعة العالية جداً`
            };
        }

        // --------------------------------
        // تعطيل Queue فقط
        // لا يتم حذفها
        // --------------------------------

        await queueMenu
            .where('.id', targetId)
            .exec('disable');

        console.log(
            `🚀 [SUCCESS] تم تعطيل Queue: ${targetQueueName}`
        );

        return {
            success: true,
            status: 'HIGH_SPEED_ENABLED',
            username: cleanUser,
            queue: targetQueueName,
            queueId: targetId,
            message:
                `تم تفعيل السرعة العالية للمستخدم ${cleanUser}`
        };

    } catch (error) {

        console.error(
            '❌ [MikroTik] خطأ:',
            error.message || error
        );

        return {
            success: false,
            status: 'MIKROTIK_ERROR',
            error:
                `فشل التنفيذ: ${error.message || error}`
        };

    } finally {

        try {
            await client.close();
        } catch (e) {}
    }
}

module.exports = {
    disableUserQueue
};
