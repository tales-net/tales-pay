const fs = require('fs');
const path = require('path');

const VOUCHERS_FILE = path.join(__dirname, 'vouchers_data.json');

// قاعدة بيانات الكروت المبدئية مفهرسة حسب المبلغ بالجنيه
const initialVouchers = {
  "5": [
    { code: "1002345678", used: false, createdAt: new Date().toISOString() },
    { code: "1002345679", used: false, createdAt: new Date().toISOString() },
    { code: "1002345680", used: false, createdAt: new Date().toISOString() },
    { code: "1002345681", used: false, createdAt: new Date().toISOString() },
    { code: "1002345682", used: false, createdAt: new Date().toISOString() },
    { code: "1002345683", used: false, createdAt: new Date().toISOString() }
  ],
  "15": [
    { code: "1052345678", used: false, createdAt: new Date().toISOString() },
    { code: "1052345679", used: false, createdAt: new Date().toISOString() },
    { code: "1052345680", used: false, createdAt: new Date().toISOString() },
    { code: "2002345678", used: false, createdAt: new Date().toISOString() }
  ],
  "30": [
    { code: "1092345678", used: false, createdAt: new Date().toISOString() },
    { code: "1092345679", used: false, createdAt: new Date().toISOString() },
    { code: "1092345680", used: false, createdAt: new Date().toISOString() },
    { code: "3002345678", used: false, createdAt: new Date().toISOString() }
  ],
  "50": [
    { code: "1012345678", used: false, createdAt: new Date().toISOString() },
    { code: "1012345679", used: false, createdAt: new Date().toISOString() },
    { code: "1012345680", used: false, createdAt: new Date().toISOString() },
    { code: "5002345678", used: false, createdAt: new Date().toISOString() }
  ],
  "100": [
    { code: "1022345678", used: false, createdAt: new Date().toISOString() },
    { code: "1022345679", used: false, createdAt: new Date().toISOString() },
    { code: "1022345680", used: false, createdAt: new Date().toISOString() },
    { code: "1002345678", used: false, createdAt: new Date().toISOString() }
  ]
};

/**
 * تحميل الكروت من ملف JSON أو إنشائه إن لم يكن موجوداً
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
    console.error('❌ خطأ في قراءة ملف الكروت، تم استرجاع البيانات المبدئية:', err.message);
    return initialVouchers;
  }
}

/**
 * حفظ التحديثات على ملف الكروت
 */
function saveVouchers(data) {
  try {
    fs.writeFileSync(VOUCHERS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('❌ خطأ في حفظ ملف الكروت:', err.message);
  }
}

/**
 * دالة سحب الكارت التالي المتاح حسب المبلغ المدفوع
 * @param {number|string} amount - المبلغ بالجنيه (مثال: 5، 15، 30 أو من amount_cents / 100)
 * @param {string} [transactionId] - رقم العملية المرجعي لتسجيله مع الكارت
 * @returns {{card: Object|null, remaining: number, packageName: string}}
 */
function getNextVoucher(amount, transactionId = null) {
  if (!amount) {
    console.warn('⚠️ لم يتم تحديد المبلغ لسحب الكارت!');
    return { card: null, remaining: 0, packageName: 'غير محدد' };
  }

  // تحويل المبلغ إلى عدد صحيح كـ Key في الملف (مثال: 5.00 يتحول إلى "5")
  const numericAmount = Math.round(Number(amount));
  const key = String(numericAmount);
  
  const vouchersData = loadVouchers();
  const pool = vouchersData[key] || [];

  // البحث عن أول كارت غير مستخدم
  const availableIndex = pool.findIndex(v => !v.used);

  if (availableIndex === -1) {
    console.warn(`🚨 تنبيه: لا توجد كروت متاحة لفئة ${key} جنيه!`);
    return { 
      card: null, 
      remaining: 0, 
      packageName: `باقة ${key} جنيه` 
    };
  }

  // تحديث حالة الكارت إلى مستخدم وتسجيل بيانات العملية
  const selectedCard = pool[availableIndex];
  selectedCard.used = true;
  selectedCard.usedAt = new Date().toISOString();
  if (transactionId) {
    selectedCard.transactionId = transactionId;
  }

  saveVouchers(vouchersData);

  // حساب عدد الكروت المتبقية من نفس الفئة
  const remainingCount = pool.filter(v => !v.used).length;

  return {
    card: selectedCard,
    remaining: remainingCount,
    packageName: `باقة ${key} جنيه`
  };
}

/**
 * دالة إضافة كروت جديدة لفئة معينة بسهولة
 * @param {string|number} amount - الفئة (مثل 5، 15)
 * @param {Array<string>} newCodes - قائمة الأرقام الجديدة
 */
function addVouchers(amount, newCodes = []) {
  const vouchersData = loadVouchers();
  const key = String(Math.round(Number(amount)));

  if (!vouchersData[key]) {
    vouchersData[key] = [];
  }

  const addedItems = newCodes.map(code => ({
    code: String(code).trim(),
    used: false,
    createdAt: new Date().toISOString()
  }));

  vouchersData[key].push(...addedItems);
  saveVouchers(vouchersData);

  return vouchersData[key].length;
}

module.exports = { 
  getNextVoucher, 
  loadVouchers, 
  saveVouchers, 
  addVouchers 
};
