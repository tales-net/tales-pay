/**
 * دالة سحب الكارت وحذفه فوراً مع الأرشفة والحفظ
 * @param {number|string} amount - الفئة المدفوعة (بالجنيه أو القروش)
 * @param {string} transactionId - رقم المعاملة
 */
async function getNextVoucher(amount, transactionId = null) {
  return new Promise((resolve) => {
    lockQueue = lockQueue.then(() => {
      try {
        if (!amount) {
          return resolve({ card: null, remaining: 0 });
        }

        const vouchersData = loadVouchersData();
        
        let numVal = Number(amount);
        // إذا كان الرقم كبيراً (مثلاً 500)، يتم تحويله من قروش إلى جنيهات (500 / 100 = 5)
        if (numVal >= 500) {
          numVal = numVal / 100;
        }

        const key = String(Math.round(numVal));

        console.log(`🔍 [Voucher] البحث عن كارت للفئة: ${key} جنيه (القيمة المدخلة: ${amount})`);

        if (!vouchersData.available[key]) {
          console.error(`🚨 [Voucher] الفئة المطلوب سحبها (${key}) غير موجودة في المفاتيح المتاحة!`);
          return resolve({ card: null, remaining: 0 });
        }

        const pool = vouchersData.available[key];

        if (!pool || pool.length === 0) {
          console.error(`🚨 [تنبيه حرج] نفدت الكروت تماماً لفئة ${key} جنيه!`);
          return resolve({ card: null, remaining: 0 });
        }

        // سحب أول كارت وتحديث بياناته
        const selectedCard = pool.shift();
        selectedCard.used = true;
        selectedCard.usedAt = new Date().toISOString();
        selectedCard.amount = key;
        if (transactionId) {
          selectedCard.transactionId = String(transactionId);
        }

        if (!vouchersData.used_archive) {
          vouchersData.used_archive = [];
        }
        vouchersData.used_archive.push(selectedCard);

        // حفظ الملف
        saveVouchersData(vouchersData);

        const remainingCount = pool.length;

        resolve({
          card: selectedCard,
          remaining: remainingCount
        });

      } catch (err) {
        console.error('❌ [Voucher Error] خطأ أثناء عملية سحب الكارت:', err.message);
        resolve({ card: null, remaining: 0 });
      }
    });
  });
}
