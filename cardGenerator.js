const { createCanvas } = require('canvas');

/**
 * تصميم وإنشاء صورة كارت إنترنت احترافية
 * @returns {Buffer} - صورة PNG بحجم الكارت
 */
function generateCardImage(cardCode, packageName, amount, transactionId) {
  const width = 600;
  const height = 350;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. خلفية متدرجة احترافية (Gradient)
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1e3c72');
  gradient.addColorStop(1, '#2a5298');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 2. إطار ذهبي أنيق
  ctx.strokeStyle = '#f39c12';
  ctx.lineWidth = 6;
  ctx.strokeRect(15, 15, width - 30, height - 30);

  // 3. اسم الشبكة الرئيسي
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Cairo, Tahoma, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🌐 شبكة حكايات نت', width / 2, 60);

  // 4. اسم الباقة والسعر
  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 20px Cairo, Tahoma, sans-serif';
  ctx.fillText(`باقة: ${packageName} (${amount} ج.م)`, width / 2, 95);

  // 5. مربع الكارت الأوسط
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(50, 120, width - 100, 120);
  ctx.strokeStyle = '#bdc3c7';
  ctx.lineWidth = 2;
  ctx.strokeRect(50, 120, width - 100, 120);

  // 6. عنوان رقم الكارت
  ctx.fillStyle = '#7f8c8d';
  ctx.font = 'bold 16px Cairo, Tahoma, sans-serif';
  ctx.fillText('رقم كارت الإنترنت الخاص بك', width / 2, 148);

  // 7. رقم الكارت المطبوع بخط كبير وواضح
  ctx.fillStyle = '#2c3e50';
  ctx.font = 'bold 36px monospace';
  ctx.fillText(cardCode || '0000000000', width / 2, 195);

  // 8. رقم العملية والتوجيهات في أسفل الكارت
  ctx.fillStyle = '#ecf0f1';
  ctx.font = '14px Cairo, Tahoma, sans-serif';
  ctx.fillText(`رقم المعاملة: ${transactionId}`, width / 2, 275);

  ctx.fillStyle = '#bdc3c7';
  ctx.font = '12px Cairo, Tahoma, sans-serif';
  ctx.fillText('نتمنى لكم تصفحاً ممتعاً ومستقراً', width / 2, 305);

  return canvas.toBuffer('image/png');
}

module.exports = { generateCardImage };
