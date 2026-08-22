const fs = require('fs');
const path = require('path');

const VOUCHERS_FILE = path.join(__dirname, 'vouchers_data.json');

// قفل آمن قائم على Promise لمنع التداخل والـ Race Conditions
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
    console.log('✅ [Voucher] تم تحديث وحفظ ملف vouchers_data.json بنجاح');
  } catch (err) {
    console.error('❌ [Voucher] خطأ في حفظ ملف الكروت:', err.message);
  }
}

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

        // التحقق مما إذا كانت الفئة القادمة محددة كمفتاح مباشر في الملف (مثل فئة "500" إن وجدت)
        // أو إذا كانت قادمة كـ "قروش" من Paymob ويجب تحويلها لجنيهات
        if (numVal >= 500 && !vouchersData.available[String(Math.round(numVal))]) {
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

        // حفظ التعديلات على القرص الصلب فوراً
        saveVouchersData(vouchersData);

        const remainingCount = pool.length;

        // التنبيهات
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
