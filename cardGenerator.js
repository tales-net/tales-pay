const { createCanvas, registerFont } = require('canvas');

/**
 * دالة إنشاء صورة الكارت
 * @param {string} code - كود الكارت/الفوتشر
 * @param {string} packageName - اسم الباقة (مثال: برونزية، بلاتينيوم)
 * @param {number} price - سعر الباقة المستحقة (مثال: 50)
 * @param {string|number} transactionId - رقم العملية
 * @returns {Buffer} - صورة PNG على شكل Buffer
 */
function generateCardImage(code, packageName, price, transactionId) {
  // 1. تحديد أبعاد الكارت
  const width = 800;
  const height = 450;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 2. رسم خلفية ملونة متدرجة (Gradient) لضمان عدم ظهور لون أسود
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0f2027'); // أزرق داكن احترافي
  gradient.addColorStop(0.5, '#203a43');
  gradient.addColorStop(1, '#2c5364');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 3. إضافة إطار دائر أبيض خفيف
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 10;
  ctx.strokeRect(15, 15, width - 30, height - 30);

  // 4. عنوان الكارت / اسم الشبكة
  ctx.fillStyle = '#f1c40f'; // لون ذهبي
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('شبكة حكايات نت - HIKAYAT NET', width / 2, 75);

  // خط فاصل تحت الاسم
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(150, 95);
  ctx.lineTo(650, 95);
  ctx.stroke();

  // 5. عرض اسم الباقة وسعرها
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(`باقة: ${packageName || 'إنترنت'} (${price} جنيه)`, width / 2, 155);

  // 6. مربع عرض كود الكارت (Voucher Code Box)
  ctx.fillStyle = '#ffffff';
  ctx.roundRect ? ctx.roundRect(100, 190, 600, 100, 15) : ctx.fillRect(100, 190, 600, 100);
  ctx.fill();

  // نص كود الكارت داخل المربع
  ctx.fillStyle = '#1e3c72';
  ctx.font = 'bold 42px monospace';
  ctx.fillText(code || 'XXXX-XXXX-XXXX', width / 2, 255);

  // 7. معلومات إضافية في الأسفل
  ctx.fillStyle = '#bdc3c7';
  ctx.font = '20px sans-serif';
  ctx.fillText(`رقم العملية: #${transactionId}`, width / 2, 340);

  ctx.fillStyle = '#2ecc71'; // لون أخضر للتأكيد
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('شكراً لاستخدامكم شبكة حكايات نت', width / 2, 390);

  // 8. إرجاع الصورة كـ Buffer بصيغة PNG
  return canvas.toBuffer('image/png');
}

module.exports = { generateCardImage };
