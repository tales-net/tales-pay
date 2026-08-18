const fs = require('fs');
const path = require('path');

const VOUCHERS_FILE = path.join(__dirname, 'vouchers_data.json');

// قاعدة بيانات الكروت المبدئية مع إضافة حالة الاستخدام الافتراضية
const initialVouchers = {
  "5": [
    { code: "1002345678", used: false },
    { code: "1002345679", used: false },
    { code: "1002345680", used: false },
    { code: "1002345681", used: false },
    { code: "1002345682", used: false },
    { code: "1002345683", used: false }
  ],
  "15": [
    { code: "1052345678", used: false },
    { code: "1052345679", used: false },
    { code: "1052345680", used: false },
    { code: "2002345678", used: false }
  ],
  "30": [
    { code: "1092345678", used: false },
    { code: "1092345679", used: false },
    { code: "1092345680", used: false },
    { code: "3002345678", used: false }
  ],
  "50": [
    { code: "1012345678", used: false },
    { code: "1012345679", used: false },
    { code: "1012345680", used: false },
    { code: "5002345678", used: false }
  ],
  "100": [
    { code: "1022345678", used: false },
    { code: "1022345679", used: false },
    { code: "1022345680", used: false },
    { code: "1002345678", used: false }
  ]
};

/**
 * قراءة وقيم الكروت من الملف أو إنشائه بالبيانات المبدئية
 */
function loadVouchers() {
  if (!fs.existsSync(VOUCHERS_FILE)) {
    saveVouchers(initialVouchers);
    return JSON.parse(JSON.stringify(initialVouchers));
  }
  try {
    const data = fs.readFileSync(VOUCHERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('❌ [Voucher] خطأ في قراءة ملف الكروت:', err.message);
    return JSON.parse(JSON.stringify(initialVouchers));
  }
}

/**
 * حفظ البيانات في ملف vouchers_data.json
 */
function saveVouchers(data) {
  try {
    fs.writeFileSync(VOUCHERS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('❌ [Voucher] خطأ في حفظ ملف الكروت:', err.message);
  }
}

/**
 * سحب أول كارت غير مستخدم للباقة، تعليمه كـ "مستعمل" وتعديل الملف
 * @param {number|string} amount - سعر الباقة (5, 15, 30, 50, 100)
 */
function getNextVoucher(amount) {
  const vouchersData = loadVouchers();
  const key = amount.toString();
  const pool = vouchersData[key] || [];

  // 1. البحث عن أول كارت غير مستخدم (used: false أو غير معرف)
  const voucherIndex = pool.findIndex(v => !v.used);

  // في حالة عدم وجود كروت غير مستخدمة متبقية
  if (voucherIndex === -1) {
    return { card: null, remaining: 0 };
  }

  // 2. تحديث الكارت بوضع علامة "تم الاستخدام" وإضافة تاريخ الاستخدام
  const card = pool[voucherIndex];
  card.used = true;
  card.usedAt = new Date().toISOString();

  // 3. حفظ البيانات المحدثة في الملف
  saveVouchers(vouchersData);

  // 4. حساب عدد الكروت المتبقية الجاهزة للاستخدام (غير مستخدمة)
  const remaining = pool.filter(v => !v.used).length;

  return {
    card: card,
    remaining: remaining
  };
}

module.exports = {
  getNextVoucher,
  loadVouchers,
  saveVouchers
};
