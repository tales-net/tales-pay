const fs = require('fs');
const path = require('path');

const VOUCHERS_FILE = path.join(__dirname, 'vouchers_data.json');

// قاعدة بيانات الكروت المبدئية (ضع أرقام الكروت الخاصة بك هنا)
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

function loadVouchers() {
  if (!fs.existsSync(VOUCHERS_FILE)) {
    fs.writeFileSync(VOUCHERS_FILE, JSON.stringify(initialVouchers, null, 2));
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

function saveVouchers(data) {
  try {
    fs.writeFileSync(VOUCHERS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ خطأ في حفظ الكروت:', err.message);
  }
}

function getNextVoucher(amount) {
  const vouchersData = loadVouchers();
  const key = amount.toString();
  const pool = vouchersData[key] || [];

  const availableIndex = pool.findIndex(v => !v.used);

  if (availableIndex === -1) {
    return { card: null, remaining: 0 };
  }

  pool[availableIndex].used = true;
  saveVouchers(vouchersData);

  const remaining = pool.filter(v => !v.used).length;

  return {
    card: pool[availableIndex],
    remaining: remaining
  };
}

module.exports = { getNextVoucher, loadVouchers };
