const profiles = [
  { name: "ماسية", price: 100, profileName: "100EGP_Profile" },
  { name: "بلاتينيوم", price: 50, profileName: "50EGP_Profile" },
  { name: "ذهبية", price: 30, profileName: "30EGP_Profile" },
  { name: "فضية", price: 15, profileName: "15EGP_Profile" },
  { name: "برونزية", price: 5, profileName: "5EGP_Profile" }
];

/**
 * دالة لتحديد الباقة بناءً على المبلغ المدفوع
 * @param {number} paidAmount - المبلغ المدفوع بالجنيه
 */
function getProfileByAmount(paidAmount) {
  if (paidAmount < 5) {
    return {
      status: "REJECTED",
      paidAmount: paidAmount,
      message: `المبلغ المدفوع (${paidAmount} ج.م) أقل من الحد الأدنى للباقات المتاحة.`
    };
  }

  // البحث عن أقصى باقة تناسب المبلغ (مثلاً 99 أو 75 تُرجع باقة 50ج)
  const matched = profiles.find(pkg => paidAmount >= pkg.price);

  return {
    status: "SUCCESS",
    paidAmount: paidAmount,
    packageName: matched.name,
    packagePrice: matched.price,
    profileName: matched.profileName
  };
}

module.exports = {
  profiles,
  getProfileByAmount
};
