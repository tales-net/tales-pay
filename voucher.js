const fs = require('fs');
const path = require('path');

const VOUCHERS_FILE = path.join(__dirname, 'vouchers_data.json');

// قاعدة بيانات الكروت المبدئية
const initialVouchers = {
  "5": [
    { code: "1002345678", used: false },
    { code: "1002345679", used: false },
    { code: "1002345680", used: false },
    { code: "1002345681", used: false },
    { code: "1002345682", used: false }
  ],
  "15": [
    { code: "1052345678", used: false },
    { code: "1052345679", used: false },
    { code: "1052345680", used: false }
  ],
  "30": [
    { code: "1092345678", used: false },
    { code: "1092345679", used: false }
  ],
  "50": [
    { code: "1012345678", used: false },
    { code: "1012345679", used: false }
  ],
  "100": [
    { code: "1022345678", used: false },
    { code: "1022345679", used: false }
  ]
};

/**
 * تحميل البيانات من ملف JSON
 */
function loadVouchers() {
  if (!fs.existsSync(VOUCHERS_FILE)) {
    saveVouchers(initialVouchers);
    return initialVouchers;
  }
  try {
    const data = fs.readFileSync(VOUCHERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('❌ خطأ في قراءة ملف الكروت:', err.message);
    return initialVouchers;
  }
}

/**
 * حفظ البيانات في ملف JSON
 */
function saveVouchers(data) {
  try {
    fs.writeFileSync(VOUCHERS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('❌ خطأ في حفظ الكروت:', err.message);
  }
}

/**
 * دالة سحب كارت جديد وحذف/تعليم الكارت المباع
 * @param {number|string} amount - الفئة المدفوعة
 * @param {string} transactionId - رقم العملية المرجعي من Paymob
 * @param {boolean} autoDelete - ضع true إذا أردت حذف الكارت فوراً من الملف بمجرد بيعه بدلاً من تعليمه كـ used
 */
function getNextVoucher(amount, transactionId = null, autoDelete = false) {
  if (!amount) {
    return { card: null, remaining: 0 };
  }

  // قراءة البيانات من الملف مباشرة لتفادي أي كاش قديم
  const vouchersData = loadVouchers();
  
  // تحويل المبلغ لكود نصي صحيح (مثلاً: 5 أو 15 أو 30)
  const key = String(Math.round(Number(amount)));
  
  if (!vouchersData[key]) {
    vouchersData[key] = [];
  }

  const pool = vouchersData[key];

  // البحث عن أول كارت غير مستخدم حقيقةً
  const availableIndex = pool.findIndex(v => v.used === false || v.used === "false");

  if (availableIndex === -1) {
    console.warn(`🚨 تنبيه: لا توجد كروت غير مستخدمة متاحة لفئة ${key} جنيه!`);
    return { card: null, remaining: 0 };
  }

  // 1. استخراج الكارت المختار
  const selectedCard = pool[availableIndex];

  if (autoDelete) {
    // خيار 1: حذف الكارت من المصفوفة كلياً بمجرد سحبه
    pool.splice(availableIndex, 1);
  } else {
    // خيار 2: تعليم الكارت كـ مستخدم وتوثيق عملية الدفع
    selectedCard.used = true;
    selectedCard.usedAt = new Date().toISOString();
    if (transactionId) {
      selectedCard.transactionId = transactionId;
    }
  }

  // 2. حفظ التحديثات فوراً وبشكل متزامن في الملف
  saveVouchers(vouchersData);

  // 3. حساب الكروت المتبقية غير المستخدمة فقط
  const remainingUnused = pool.filter(v => v.used === false || v.used === "false").length;

  console.log(`🎟️ [Voucher] تم سحب الكارت (${selectedCard.code}) | المتبقي لفئة ${key} ج.م: ${remainingUnused}`);

  return {
    card: selectedCard,
    remaining: remainingUnused
  };
}

/**
 * دالة لحذف الكروت المستهلكة نهائياً من الملف لتصغير حجمه
 */
function purgeUsedVouchers() {
  const vouchersData = loadVouchers();
  for (const key in vouchersData) {
    vouchersData[key] = vouchersData[key].filter(v => v.used === false || v.used === "false");
  }
  saveVouchers(vouchersData);
  console.log("🧹 تم تنظيف وحذف الكروت المستخدمة بنجاح.");
}

module.exports = { 
  getNextVoucher, 
  loadVouchers, 
  saveVouchers,
  purgeUsedVouchers 
};
