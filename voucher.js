const fs = require('fs');
const path = require('path');

const VOUCHERS_FILE = path.join(__dirname, 'vouchers_data.json');

// قفل آمن قائم على الـ Promise بدلاً من while loop لتفادي تجمد السيرفر
let lockQueue = Promise.resolve();

/**
 * تحميل البيانات من ملف JSON
 */
function loadVouchersData() {
  if (!fs.existsSync(VOUCHERS_FILE)) {
    const emptyStructure = { available: {}, used_archive: [] };
    saveVouchersData(emptyStructure);
    return emptyStructure;
  }
  try {
    const rawData = fs.readFileSync(VOUCHERS_FILE, 'utf8');
    const parsed = JSON.parse(rawData);

    if (!parsed.available) {
      return { available: parsed, used_archive: [] };
    }
    if (!parsed.used_archive) {
      parsed.used_archive = [];
    }
    return parsed;
  } catch (err) {
    console.error('❌ [Voucher] خطأ في قراءة ملف الكروت:', err.message);
    return { available: {}, used_archive: [] };
  }
}

/**
 * حفظ البيانات في ملف JSON بشكل متزامن وآمن
 */
function saveVouchersData(data) {
  try {
    fs.writeFileSync(VOUCHERS_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log('✅ [Voucher] تم حفظ التحديثات في ملف vouchers_data.json بنجاح');
  } catch (err) {
    console.error('❌ [Voucher] خطأ في حفظ ملف الكروت:', err.message);
  }
}

/**
 * دالة سحب الكارت وحذفه فوراً مع الأرشفة والحفظ
 * @param {number|string} amount - الفئة المدفوعة
 * @param {string} transactionId - رقم المعاملة
 */
async function getNextVoucher(amount, transactionId = null) {
  // إدراج العملية في قائمة الانتظار (Queue) لضمان التزامن ومنع الـ Race Conditions
  return new Promise((resolve) => {
    lockQueue = lockQueue.then(() => {
      try {
        if (!amount) {
          return resolve({ card: null, remaining: 0 });
        }

        const vouchersData = loadVouchersData();
        
        // تحويل المبلغ إلى عدد صحيح كـ String (مثال: 5)
        const key = String(Math.round(Number(amount)));

        if (!vouchersData.available[key]) {
          console.error(`🚨 [Voucher] الفئة المطلوب سحبها (${key}) غير موجودة في ملف الكروت!`);
          return resolve({ card: null, remaining: 0 });
        }

        const pool = vouchersData.available[key];

        // 1. التحقق في حالة نفاذ المخزون
        if (!pool || pool.length === 0) {
          console.error(`🚨 [🚨 تنبيه حرج] نفدت الكروت تماماً لفئة ${key} جنيه! يجب إعادة الشحن فوراً.`);
          return resolve({ card: null, remaining: 0 });
        }

        // 2. سحب الكارت الأول وحذفه فوراً من قائمة المتاح
        const selectedCard = pool.shift(); // splice(0,1) تستبدل بـ shift() لأداء أسرع

        // 3. تحديث بيانات الكارت
        selectedCard.used = true;
        selectedCard.usedAt = new Date().toISOString();
        selectedCard.amount = key;
        if (transactionId) {
          selectedCard.transactionId = String(transactionId);
        }

        // 4. إضافته لأرشيف المباع
        if (!vouchersData.used_archive) {
          vouchersData.used_archive = [];
        }
        vouchersData.used_archive.push(selectedCard);

        // 5. حفظ الملف على القرص فوراً
        saveVouchersData(vouchersData);

        const remainingCount = pool.length;

        // 6. التنبيهات
        if (remainingCount === 0) {
          console.error(`🔴 [تنبيه تحذيري] تم سحب آخر كارت! المتبقي حالياً: 0 كارت لفئة ${key} جنيه!`);
        } else if (remainingCount <= 5) {
          console.warn(`⚠️ [تنبيه انخفاض المخزون] انتبه! المتبقي فقط (${remainingCount}) كروت لفئة ${key} جنيه!`);
        } else {
          console.log(`🎟️ [Voucher] تم سحب الكارت بنجاح (${selectedCard.code}) | المتبقي لفئة ${key}ج: ${remainingCount}`);
        }

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

module.exports = {
  getNextVoucher,
  loadVouchersData,
  saveVouchersData
};
