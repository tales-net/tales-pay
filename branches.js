const BRANCH_NAMES = {
  waitPage: "يجب تأكيد الدفع من محفظتك",
  main: "حكايات نت رئيسي",
  branch2: "حكايات نت فرع ثاني",
  branch3: "حكايات نت فرع ثالث"
};


function getBranchDisplayName(branchKey) {
  return BRANCH_NAMES[branchKey] || BRANCH_NAMES.branch2;
}

module.exports = {
  BRANCH_NAMES,
  getBranchDisplayName
};
