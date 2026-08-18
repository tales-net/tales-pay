const fs = require('fs');
const path = require('path');

const VOUCHERS_FILE = path.join(__dirname, 'vouchers_data.json');

// قاعدة بيانات الكروت المبدئية (يتم استخدامها في حال عدم وجود الملف)
const initialVouchers = {
  "5": [
    { code: "1002345678" },
    { code: "1002345679" },
    { code: "1002345680" },
    { code: "1002345681" },
    { code: "1002345682" },
    { code: "1002345683" }
  ],
  "15": [
    { code: "1052345678" },
    { code: "1052345679" },
    { code: "1052345680" },
    { code: "2002345678" }
  ],
  "30": [
    { code: "1092345678" },
    { code: "1092345679" },
    { code: "1092345680" },
    { code: "3002345678" }
  ],
  "50": [
    { code: "1012345678" },
    { code: "1012345679" },
    { code: "1012345680" },
    { code: "5002345678" }
  ],
  "100": [
    { code: "1022345678" },
    { code: "1022345679" },
    { code: "1022345680" },
    { code: "1002345678" }
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
 * سحب أول كارت متاح للباقة وحذفه تماماً من القائمة وتحديث الملف
 * @param {number|string} amount - سعر الباقة (5, 15, 30, 50, 100)
 */
function getNextVoucher(amount) {
  const vouchersData = loadVouchers();
  const key = amount.toString();
  const pool = vouchersData[key] || [];

  // التحقق من وجود كروت متاحة لهذه الفئة
  if (!pool || pool.length === 0) {
    return { card: null, remaining: 0 };
  }

  // 1. استخراج وحذف الكارت الأول من القائمة نهائياً
  const card = pool.shift();

  // 2. تحديث قائمة الكروت بالفئة المحددة
  vouchersData[key] = pool;

  // 3. حفظ البيانات التحديثية بداخل ملف vouchers_data.json
  saveVouchers(vouchersData);

  // 4. إرجاع الكارت مع عدد الكروت المتبقية
  return {
    card: card,
    remaining: pool.length
  };
}

module.exports = {
  getNextVoucher,
  loadVouchers,
  saveVouchers
};
