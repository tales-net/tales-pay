const fs = require('fs');
const path = require('path');

const VOUCHERS_FILE = path.join(__dirname, 'vouchers_data.json');

// قفل لمنع التداخل والـ Race Conditions في نفس الوقت
let isProcessing = false;

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

    // توافق مع أسلوب الهيكلية السابقة أو الجديدة
    if (!parsed.available) {
      return { available: parsed, used_archive: [] };
    }
    return parsed;
  } catch (err) {
    console.error('❌ [Voucher] خطأ في قراءة ملف الكروت:', err.message);
    return { available: {}, used_archive: [] };
  }
}

/**
 * حفظ البيانات في ملف JSON
 */
function saveVouchersData(data) {
  try {
    fs.writeFileSync(VOUCHERS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('❌ [Voucher] خطأ في حفظ ملف الكروت:', err.message);
  }
}

/**
 * دالة سحب الكارت وحذفه فوراً مع التنبيه التدريجي لنفاذ المخزون
 * @param {number|string} amount - الفئة المدفوعة
 * @param {string} transactionId - رقم المعاملة
 */
function getNextVoucher(amount, transactionId = null) {
  if (!amount) {
    return { card: null, remaining: 0 };
  }

  // انتظر في حالة وجود طلب آخر في نفس الملي ثانية
  while (isProcessing) {}
  isProcessing = true;

  try {
    const vouchersData = loadVouchersData();
    const key = String(Math.round(Number(amount)));

    if (!vouchersData.available[key]) {
      vouchersData.available[key] = [];
    }

    const pool = vouchersData.available[key];

    // 1. التحقق في حالة النفاذ الكلي للمخزون
    if (pool.length === 0) {
      console.error(`🚨 [🚨 تنبيه حرج] نفدت الكروت تماماً لفئة ${key} جنيه! يجب إعادة الشحن فوراً.`);
      isProcessing = false;
      return { card: null, remaining: 0 };
    }

    // 2. سحب الكارت الأول وحذفه فوراً من المتاح لتخفيف الملف والذاكرة
    const [selectedCard] = pool.splice(0, 1);

    // 3. تحديث بيانات الكارت وترخيصه كـ مستخدم
    selectedCard.used = true;
    selectedCard.usedAt = new Date().toISOString();
    selectedCard.amount = key;
    if (transactionId) {
      selectedCard.transactionId = String(transactionId);
    }

    // 4. أرشفة الكارت المباع في قسم الأرشيف لتوثيق المبيعات
    if (!vouchersData.used_archive) {
      vouchersData.used_archive = [];
    }
    vouchersData.used_archive.push(selectedCard);

    // 5. حفظ التعديل على القرص الصلب فوراً
    saveVouchersData(vouchersData);

    const remainingCount = pool.length;

    // 6. === التنبيه التدريجي عند انخفاض ونفاذ الكروت ===
    if (remainingCount === 0) {
      console.error(`🔴 [تنبيه تحذيري] تم سحب آخر كارت! المتبقي حالياً: 0 كارت لفئة ${key} جنيه!`);
    } else if (remainingCount <= 5) {
      console.warn(`⚠️ [تنبيه انخفاض المخزون] انتبه! المتبقي فقط (${remainingCount}) كروت لفئة ${key} جنيه!`);
    } else {
      console.log(`🎟️ [Voucher] تم سحب الكارت بنجاح (${selectedCard.code}) | المتبقي لفئة ${key}ج: ${remainingCount}`);
    }

    isProcessing = false;

    // إرجاع الكارت مع عدد الكروت المتبقية ليتم إرسال التنبيه عبر تلجرام في telegram.js
    return {
      card: selectedCard,
      remaining: remainingCount
    };

  } catch (err) {
    isProcessing = false;
    console.error('❌ [Voucher Error] خطأ أثناء عملية سحب الكارت:', err.message);
    return { card: null, remaining: 0 };
  }
}

module.exports = {
  getNextVoucher,
  loadVouchersData,
  saveVouchersData
};
