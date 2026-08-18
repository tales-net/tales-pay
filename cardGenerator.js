const { createCanvas } = require('canvas');

/**
 * دالة إنشاء صورة الكارت احترافية بدون مشاكل الشاشة السوداء
 * @param {string} code - كود الكارت/الفوتشر
 * @param {string} packageName - اسم الباقة (مثال: برونزية، بلاتينيوم)
 * @param {number} price - سعر الباقة المستحقة (مثال: 50)
 * @param {string|number} transactionId - رقم العملية
 * @returns {Buffer} - صورة JPEG عالية الجودة على شكل Buffer
 */
function generateCardImage(code, packageName, price, transactionId) {
  const width = 800;
  const height = 450;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 1. فرض خلفية بيضاء صريحة أولاً لمنع الشفافية واللون الأسود نهائياً
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // 2. رسم الخلفية المتدرجة الجذابة
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0f2027');
  gradient.addColorStop(0.5, '#203a43');
  gradient.addColorStop(1, '#2c5364');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 3. إضافة إطار دائر أبيض خفيف
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 6;
  ctx.strokeRect(15, 15, width - 30, height - 30);

  // 4. عنوان الكارت / اسم الشبكة
  ctx.fillStyle = '#f1c40f'; // لون ذهبي
  ctx.font = 'bold 36px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('شبكة حكايات نت - HIKAYAT NET', width / 2, 75);

  // خط فاصل تزيني
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(150, 95);
  ctx.lineTo(650, 95);
  ctx.stroke();

  // 5. عرض اسم الباقة وسعرها
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.fillText(`باقة: ${packageName || 'إنترنت'} (${price} جنيه)`, width / 2, 150);

  // 6. رسم صندوق الكود الابيض بشكل مضمون
  ctx.fillStyle = '#FFFFFF';
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(100, 185, 600, 95, 12);
    ctx.fill();
  } else {
    ctx.fillRect(100, 185, 600, 95);
  }

  // نص كود الكارت داخل المربع
  ctx.fillStyle = '#1e3c72';
  ctx.font = 'bold 40px "Courier New", monospace';
  ctx.fillText(code || 'XXXX-XXXX-XXXX', width / 2, 248);

  // 7. معلومات العملية ورسالة الشكر
  ctx.fillStyle = '#bdc3c7';
  ctx.font = '20px Arial, sans-serif';
  ctx.fillText(`رقم العملية: #${transactionId}`, width / 2, 335);

  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 22px Arial, sans-serif';
  ctx.fillText('شكراً لاستخدامكم شبكة حكايات نت', width / 2, 385);

  // 8. إرجاع الصورة بصيغة JPEG بوضوح عالي (جودة 95%) لضمان التحميل السليم
  return canvas.toBuffer('image/jpeg', { quality: 0.95 });
}

module.exports = { generateCardImage };
