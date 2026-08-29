const fs = require('fs');
const path = require('path');

const VOUCHERS_FILE = path.join(__dirname, 'vouchers_data.json');

// قفل آمن قائم على Promise لمنع التداخل والـ Race Conditions
let lockQueue = Promise.resolve();

/**
 * أسماء الفروع للطباعة والتنسيق
 */
const BRANCH_NAMES = {
  main: 'حكايات نت رئيسي',
  branch2: 'حكايات نت فرع ثاني',
  branch3: 'حكايات نت فرع ثالث'
};

/**
 * دالة مساعدة لإنشاء الهيكلية المعتمدة في الملف
 */
function createDefaultStructure() {
  return {
    branches: {
      main: { name: BRANCH_NAMES.main, available: {}, used_archive: [] },
      branch2: { name: BRANCH_NAMES.branch2, available: {}, used_archive: [] },
      branch3: { name: BRANCH_NAMES.branch3, available: {}, used_archive: [] }
    }
  };
}

/**
 * تحميل البيانات من ملف JSON مع دعم الهيكلية الموحدة وتحت المفتاح "branches"
 */
function loadVouchersData() {
  if (!fs.existsSync(VOUCHERS_FILE)) {
    const defaultData = createDefaultStructure();
    saveVouchersData(defaultData);
    return defaultData.branches;
  }
  try {
    const rawData = fs.readFileSync(VOUCHERS_FILE, 'utf8');
    const parsed = JSON.parse(rawData);

    // الوصول لـ branches سواء كان الملف يحتوي على "branches" أو الفروع مباشرة بالجذر
    const branchesData = parsed.branches || parsed;

    const result = {
      main: branchesData.main || { name: BRANCH_NAMES.main, available: {}, used_archive: [] },
      branch2: branchesData.branch2 || { name: BRANCH_NAMES.branch2, available: {}, used_archive: [] },
      branch3: branchesData.branch3 || { name: BRANCH_NAMES.branch3, available: {}, used_archive: [] }
    };

    return result;
  } catch (err) {
    console.error('❌ [Voucher] خطأ في قراءة ملف الكروت:', err.message);
    return createDefaultStructure().branches;
  }
}

/**
 * حفظ البيانات في ملف JSON بشكل متزامن وآمن داخل العقدة "branches"
 */
function saveVouchersData(data) {
  try {
    // التأكد من حفظ البيانات دائماً تحت العقدة "branches" للحفاظ على نمط البيانات الموحد
    const payload = data.branches ? data : { branches: data };
    fs.writeFileSync(VOUCHERS_FILE, JSON.stringify(payload, null, 2), 'utf8');
    console.log('✅ [Voucher] تم تحديث وحفظ ملف vouchers_data.json بنجاح');
  } catch (err) {
    console.error('❌ [Voucher] خطأ في حفظ ملف الكروت:', err.message);
  }
}

/**
 * دالة سحب الكارت وحذفه فوراً مع الأرشفة والحفظ بناءً على الفرع المحدد
 * @param {number|string} amount - الفئة المدفوعة (بالجنيه أو القروش)
 * @param {string} transactionId - رقم المعاملة
 * @param {string} branchKey - مفتاح الفرع (main, branch2, branch3)
 */
async function getNextVoucher(amount, transactionId = null, branchKey = 'main') {
  return new Promise((resolve) => {
    lockQueue = lockQueue.then(() => {
      try {
        if (!amount) {
          return resolve({ card: null, remaining: 0, branchName: BRANCH_NAMES[branchKey] || branchKey });
        }

        // اختيار الفرع المعتمد (الافتراضي: main)
        const selectedBranch = (branchKey && BRANCH_NAMES[branchKey]) ? branchKey : 'main';
        const branchDisplayName = BRANCH_NAMES[selectedBranch];

        const allBranches = loadVouchersData();
        const branchData = allBranches[selectedBranch] || { name: branchDisplayName, available: {}, used_archive: [] };

        let numVal = Number(amount);

        // التحقق مما إذا كانت الفئة القادمة محددة كمفتاح مباشر في الملف (مثل فئة "500" إن وجدت)
        // أو إذا كانت قادمة كـ "قروش" من Paymob ويجب تحويلها لجنيهات
        if (numVal >= 500 && !branchData.available[String(Math.round(numVal))]) {
          numVal = numVal / 100;
        }

        const key = String(Math.round(numVal));

        console.log(`🔍 [Voucher] البحث عن كارت | الفرع: ${branchDisplayName} | الفئة: ${key} جنيه (المبلغ الأصلي: ${amount})`);

        if (!branchData.available || !branchData.available[key]) {
          console.error(`🚨 [Voucher] الفئة المطلوب سحبها (${key}) غير موجودة في الفرع (${branchDisplayName})!`);
          return resolve({ card: null, remaining: 0, branchName: branchDisplayName });
        }

        const pool = branchData.available[key];

        if (!pool || pool.length === 0) {
          console.error(`🚨 [تنبيه حرج] نفدت الكروت تماماً لفئة ${key} جنيه بـ ${branchDisplayName}!`);
          return resolve({ card: null, remaining: 0, branchName: branchDisplayName });
        }

        // سحب أول كارت وتحديث بياناته
        const selectedCard = pool.shift();
        selectedCard.used = true;
        selectedCard.usedAt = new Date().toISOString();
        selectedCard.amount = key;
        selectedCard.branch = selectedBranch;
        selectedCard.branchName = branchDisplayName;

        if (transactionId) {
          selectedCard.transactionId = String(transactionId);
        }

        if (!branchData.used_archive) {
          branchData.used_archive = [];
        }
        branchData.used_archive.push(selectedCard);

        // تحديث الفرع المختار وحفظ الكل تحت الكائن الرئيسي branches
        allBranches[selectedBranch] = branchData;
        saveVouchersData(allBranches);

        const remainingCount = pool.length;

        // التنبيهات
        if (remainingCount === 0) {
          console.error(`🔴 [تنبيه تحذيري] تم سحب آخر كارت! المتبقي حالياً: 0 كارت لفئة ${key}ج (${branchDisplayName})!`);
        } else if (remainingCount <= 5) {
          console.warn(`⚠️ [تنبيه انخفاض المخزون] انتبه! المتبقي فقط (${remainingCount}) كروت لفئة ${key}ج (${branchDisplayName})!`);
        } else {
          console.log(`🎟️ [Voucher] تم سحب الكارت بنجاح (${selectedCard.code}) | المتبقي لفئة ${key}ج بـ ${branchDisplayName}: ${remainingCount}`);
        }

        resolve({
          card: selectedCard,
          remaining: remainingCount,
          branchName: branchDisplayName
        });

      } catch (err) {
        console.error('❌ [Voucher Error] خطأ أثناء عملية سحب الكارت:', err.message);
        resolve({ card: null, remaining: 0, branchName: BRANCH_NAMES[branchKey] || 'الفرع الرئيسي' });
      }
    });
  });
}

module.exports = {
  getNextVoucher,
  loadVouchersData,
  saveVouchersData,
  BRANCH_NAMES
};
