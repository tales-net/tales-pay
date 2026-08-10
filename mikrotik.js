const { RouterOSClient } = require('routeros-client');

async function disableUserQueue(username) {

    if (!username) {
        return {
            success: false,
            error: 'اسم المستخدم غير موجود'
        };
    }

    // إزالة @speed_high إن وجدت
    const atPos = username.indexOf('@');

    const cleanUser =
        atPos > 0
            ? username.substring(0, atPos)
            : username;

    const queueName = `<hotspot-${cleanUser}>`;

    console.log('================================');
    console.log('USER  =', cleanUser);
    console.log('QUEUE =', queueName);
    console.log('================================');

    const client = new RouterOSClient({
        host: process.env.MIKROTIK_HOST,
        user: process.env.MIKROTIK_USER,
        password: process.env.MIKROTIK_PASSWORD,
        port: parseInt(process.env.MIKROTIK_PORT || '8728'),
        timeout: 10000
    });

    try {

        const api = await client.connect();

        console.log('✅ Connected to MikroTik');

        const queueMenu = api.menu('/queue/simple');

        // البحث عن Queue بالاسم فقط
        const queues = await queueMenu
            .where('name', queueName)
            .get();

        if (!queues || queues.length === 0) {

            console.log(
                '⚡ Queue غير موجودة:',
                queueName
            );

            await client.close();

            return {
                success: true,
                status: 'ALREADY_HIGH_SPEED',
                username: cleanUser,
                queue: queueName,
                message:
                    'المستخدم بالفعل على السرعة العالية جداً'
            };
        }

        const queue = queues[0];

        console.log(
            '🎯 FOUND:',
            queue.name
        );

        console.log(
            '🆔 ID:',
            queue['.id']
        );

        // --------------------------------
        // تنفيذ DISABLE على هذه Queue فقط
        // --------------------------------

        await queueMenu
            .where('.id', queue['.id'])
            .exec('disable');

        console.log(
            '🚀 DISABLE COMMAND SENT'
        );

        await client.close();

        return {
            success: true,
            status: 'HIGH_SPEED_ENABLED',
            username: cleanUser,
            queue: queueName,
            message:
                `تم تفعيل السرعة العالية للمستخدم ${cleanUser}`
        };

    } catch (error) {

        console.error(
            '❌ MikroTik ERROR:',
            error.message || error
        );

        try {
            await client.close();
        } catch (e) {}

        return {
            success: false,
            error:
                `فشل التنفيذ: ${error.message || error}`
        };
    }
}

module.exports = {
    disableUserQueue
};
