/**
 * ملف خاص بعبارات التهنئة، الشكر، والأدعية للمساهمات المالية (أكبر من 100 جنيه)
 */

const contributionBlessings = [
  "جزاكم الله خيراً وجعل هذه المساهمة الطيبة في ميزان حسناتكم، وبارك لكم في مالكم وأهليكم.",
  "تقبل الله منا ومنكم صالح الأعمال، نسأل الله أن يبارك في عطائكم ويجعله صدقة جارية ونوراً في دربكم.",
  "بارك الله في جهودكم الكريمة ودعمكم المستمر، وجعل الله التوفيق والنجاح حليفكم دائماً وأبداً.",
  "نشكر لكم مساهمتكم المباركة، نسأل الله أن يخلف عليكم خيراً وأن يرزقكم من حيث لا تحتسبون."
];

/**
 * دالة لاختيار رسالة تهنئة عشوائية أو ثابتة بشكل مميز
 */
function getRandomBlessingMessage(amount) {
  const randomIndex = Math.floor(Math.random() * contributionBlessings.length);
  return {
    title: "✨ مساهمة مباركة ودعم كريم ✨",
    message: contributionBlessings[randomIndex],
    amountText: `مبلغ المساهمة: ${amount} جنيه`,
    footerNote: "دمتم سباقين للخير،، شبكة حكايات نت"
  };
}

module.exports = {
  contributionBlessings,
  getRandomBlessingMessage
};
