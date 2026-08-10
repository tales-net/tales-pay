const { RouterOSClient } = require('routeros-client');

async function disableUserQueue(username) {

    if (!username) {
        return {
            success: false,
            error: 'اسم المستخدم غير موجود'
        };
    }

    const atPos = username.indexOf('@');

    const cleanUser =
        atPos > 0
            ? username.substring(0, atPos)
            : username;

    const targetQueueName = `<hotspot-${cleanUser}>`;

    console.log("================================");
    console.log("USER  =", cleanUser);
    console.log("QUEUE =", targetQueueName);
    console.log("================================");

    const client = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT || '8728'),
        timeout: 10
    });

    try {

        const api = await client.connect();

        console.log("✅ MikroTik connected");

        const queueMenu = api.menu('/queue/simple');

        // البحث عن Queue المطلوبة فقط
        const queues = await queueMenu
            .where('name', targetQueueName)
            .get();

        if (!queues || queues.length === 0) {

            console.log(
                "⚡ Queue غير موجودة - السرعة العالية مفعلة بالفعل"
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

        const targetQueue = queues[0];
        const targetId = targetQueue['.id'];

        console.log("🎯 FOUND =", targetQueue.name);
        console.log("🆔 ID =", targetId);

        // التأكد من الاسم
        if (targetQueue.name !== targetQueueName) {

            return {
                success: false,
                status: 'QUEUE_MISMATCH',
                error: 'Queue غير مطابقة'
            };
        }

        // إذا كانت Disabled بالفعل
        if (
            targetQueue.disabled === 'true' ||
            targetQueue.disabled === true
        ) {

            console.log(
                "⚡ Queue already disabled"
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

        // تنفيذ DISABLE
        console.log("⚡ Sending DISABLE...");

        await queueMenu
            .where('.id', targetId)
            .exec('disable');

        console.log("✅ DISABLE command sent");

        // ---------------------------------
        // التحقق من MikroTik
        // ---------------------------------

        const verifyQueues = await queueMenu
            .where('.id', targetId)
            .get();

        if (!verifyQueues || verifyQueues.length === 0) {

            return {
                success: false,
                status: 'VERIFY_FAILED',
                error: 'تعذر التحقق من Queue'
            };
        }

        const verifyQueue = verifyQueues[0];

        console.log(
            "🔎 VERIFY DISABLED =",
            verifyQueue.disabled
        );

        if (
            verifyQueue.disabled === 'true' ||
            verifyQueue.disabled === true
        ) {

            console.log(
                "🚀 SUCCESS: Queue DISABLED"
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

        }

        return {
            success: false,
            status: 'DISABLE_FAILED',
            username: cleanUser,
            queue: targetQueueName,
            queueId: targetId,
            error:
                'أمر التعطيل أُرسل ولكن MikroTik لم يعطل Queue'
        };

    } catch (error) {

        console.error(
            "❌ MikroTik ERROR =",
            error.message || error
        );

        return {
            success: false,
            status: 'MIKROTIK_ERROR',
            error: error.message || String(error)
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
