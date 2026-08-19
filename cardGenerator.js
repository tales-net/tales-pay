const sharp = require('sharp');

/**
 * توليد صورة الكارت بأعلى جودة وبدون شاشة سوداء نهائياً
 * @param {string} code - كود الكارت/الفوتشر
 * @param {string} packageName - اسم الباقة (مثال: برونزية، 50)
 * @param {number|string} price - سعر الباقة
 * @param {string|number} transactionId - رقم العملية
 * @returns {Promise<Buffer>} - Buffer يحتوي على صورة JPEG مصمتة
 */
async function generateCardImage(code, packageName, price, transactionId) {
  // 1. تنظيف وتجهيز البيانات لمنع أي أخطاء في الـ SVG
  const safeCode = String(code || 'XXXX-XXXX-XXXX');
  const safePackageName = String(packageName || 'إنترنت');
  const safePrice = String(price || '0');
  const safeTransactionId = String(transactionId || '0000');

  // 2. تصميم صورة الكارت بصيغة SVG متكاملة وعالية الدقة
  const svgImage = `
    <svg width="800" height="450" xmlns="http://www.w3.org/2000/svg">
      <style>
        .title { font-family: Arial, sans-serif; font-size: 34px; font-weight: bold; fill: #f1c40f; text-anchor: middle; }
        .sub-title { font-family: Arial, sans-serif; font-size: 24px; font-weight: bold; fill: #ffffff; text-anchor: middle; }
        .code-text { font-family: 'Courier New', monospace; font-size: 42px; font-weight: bold; fill: #1e3c72; text-anchor: middle; letter-spacing: 2px; }
        .tx-id { font-family: Arial, sans-serif; font-size: 18px; fill: #9fb3c8; text-anchor: middle; }
        .footer { font-family: Arial, sans-serif; font-size: 22px; font-weight: bold; fill: #2ecc71; text-anchor: middle; }
      </style>

      <!-- 1. خلفية زرقاء داكنة مصمتة مئة بالمئة -->
      <rect width="800" height="450" fill="#0f2027" />

      <!-- 2. إطار داخلي جمالي مع حواف دائرية -->
      <rect x="20" y="20" width="760" height="410" rx="15" ry="15" fill="none" stroke="#f1c40f" stroke-width="3" opacity="0.8" />

      <!-- 3. اسم الشبكة / العنوان -->
      <text x="400" y="75" class="title">شبكة حكايات نت - HIKAYAT NET</text>
      
      <!-- خط فاصل تحت العنوان -->
      <line x1="150" y1="95" x2="650" y2="95" stroke="#f1c40f" stroke-width="2" opacity="0.5" />

      <!-- 4. تفاصيل الباقة والسعر -->
      <text x="400" y="140" class="sub-title">باقة: ${safePackageName} (${safePrice} جنيه)</text>

      <!-- 5. مربع أبيض مصمت خلف كود الكارت -->
      <rect x="80" y="175" width="640" height="100" rx="12" ry="12" fill="#ffffff" />

      <!-- 6. كتابة كود الكارت داخل المربع -->
      <text x="400" y="240" class="code-text">${safeCode}</text>

      <!-- 7. رقم العملية واسفل الكارت -->
      <text x="400" y="335" class="tx-id">رقم العملية: #${safeTransactionId}</text>
      <text x="400" y="385" class="footer">شكراً لاستخدامكم شبكة حكايات نت</text>
    </svg>
  `;

  try {
    // 3. تحويل الـ SVG إلى صورة JPEG مصمتة بعيداً عن الشفافية والمشاكل
    const imageBuffer = await sharp(Buffer.from(svgImage))
      .jpeg({ quality: 95 })
      .toBuffer();

    return imageBuffer;
  } catch (error) {
    console.error('❌ [CardGenerator] خطأ أثناء إنشاء صورة الكارت:', error);
    throw error;
  }
}

module.exports = {
  generateCardImage
};
