const profilesList = [
  { name: "ماسية", price: 100, profileName: "100EGP_Profile" },
  { name: "بلاتينيوم", price: 50, profileName: "50EGP_Profile" },
  { name: "ذهبية", price: 30, profileName: "30EGP_Profile" },
  { name: "فضية", price: 15, profileName: "15EGP_Profile" },
  { name: "برونزية", price: 5, profileName: "5EGP_Profile" }
];

/**
 * دالة لتحديد اسم الباقة بناءً على المبلغ المدفوع (لتوافق الـ Webhook)
 * @param {number|string} amount - المبلغ المدفوع بالجنيه
 * @returns {string} - اسم الباقة
 */
function getPackageName(amount) {
  const numericAmount = parseFloat(amount) || 0;
  const matched = profilesList.find(pkg => numericAmount >= pkg.price);
  return matched ? `باقة ${matched.name}` : "باقة إنترنت شبكة حكايات";
}

/**
 * دالة تفصيلية لتحديد الباقة بناءً على المبلغ المدفوع
 * @param {number} paidAmount - المبلغ المدفوع بالجنيه
 */
function getProfileByAmount(paidAmount) {
  const numericAmount = parseFloat(paidAmount) || 0;
  if (numericAmount < 5) {
    return {
      status: "REJECTED",
      paidAmount: numericAmount,
      message: `المبلغ المدفوع (${numericAmount} ج.م) أقل من الحد الأدنى للباقات المتاحة.`
    };
  }

  // البحث عن أقصى باقة تناسب المبلغ
  const matched = profilesList.find(pkg => numericAmount >= pkg.price);

  return {
    status: "SUCCESS",
    paidAmount: numericAmount,
    packageName: matched.name,
    packagePrice: matched.price,
    profileName: matched.profileName
  };
}

// تصدير الملف كـ Function رئيسية يدعم استخدام module.exports(amount) مباشرة أو الكائنات المرفقة
module.exports = getPackageName;
module.exports.profiles = profilesList;
module.exports.getProfileByAmount = getProfileByAmount;
module.exports.getPackageName = getPackageName;
