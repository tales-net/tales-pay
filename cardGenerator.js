const { createCanvas } = require("canvas");

/**
 * توليد صورة كارت إنترنت احترافية لشبكة حكايات نت
 * @param {string} voucherCode - رقم الكارت (الرمز)
 * @param {string} packageName - اسم الباقة أو البروفايل
 * @param {number|string} amount - سعر الباقة بالجنية
 * @param {string|number} transactionId - رقم المعاملة
 * @returns {Buffer} Buffer يحتوي على صورة PNG عالية الجودة
 */
function generateCardImage(voucherCode, packageName, amount, transactionId) {
  // أبعاد الكارت
  const width = 800;
  const height = 450;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // 1. رسم الخلفية المتدرجة (Gradient Background) بألوان التكنولوجيا
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, "#0f2027"); // أزرق ليلي داكن
  bgGradient.addColorStop(0.5, "#203a43"); // أزرق بترولي
  bgGradient.addColorStop(1, "#2c5364"); // تيل داكن
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // 2. رسم خلفية وزخارف موجات شبكة الإنترنت (Tech Wave Effect)
  ctx.save();
  ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(width + 100 - i * 80, -50 + i * 50, 300 + i * 40, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 3. رسم إطار داخلي مضيء للكارت
  ctx.strokeStyle = "rgba(0, 210, 255, 0.3)";
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  // 4. رأس الكارت - اسم الشبكة واللوجو
  ctx.fillStyle = "#00d2ff"; // لون أزرق سماوي مضيء
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("📡 شبكة حكايات نت", width - 50, 75);

  ctx.fillStyle = "#ffffff";
  ctx.font = "18px sans-serif";
  ctx.fillText("Hikayat Wi-Fi Network", width - 50, 105);

  // شارة ترحيبية / وسم الجودة على اليسار
  ctx.fillStyle = "rgba(0, 210, 255, 0.15)";
  ctx.beginPath();
  ctx.roundRect(50, 50, 180, 45, 10);
  ctx.fill();
  ctx.strokeStyle = "#00d2ff";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#00d2ff";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("⚡ شحن سريع فوري", 140, 78);

  // 5. خط فاصل مزخرف
  const lineGrad = ctx.createLinearGradient(50, 0, width - 50, 0);
  lineGrad.addColorStop(0, "rgba(0, 210, 255, 0.1)");
  lineGrad.addColorStop(0.5, "rgba(0, 210, 255, 0.8)");
  lineGrad.addColorStop(1, "rgba(0, 210, 255, 0.1)");
  ctx.fillStyle = lineGrad;
  ctx.fillRect(50, 130, width - 100, 2);

  // 6. تفاصيل الباقة والسعر
  ctx.textAlign = "right";

  // اسم الباقة
  ctx.fillStyle = "#a8ff78"; // أخضر فسفوري هادئ
  ctx.font = "bold 26px sans-serif";
  ctx.fillText(`📦 الباقة: ${packageName}`, width - 60, 180);

  // السعر
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(`💰 القيمة: ${amount} جنيه مصري`, width - 60, 220);

  // 7. مربع عرض رقم الكارت (Voucher Box) - تصميم بارز ومضيء
  const boxX = 60;
  const boxY = 250;
  const boxW = width - 120;
  const boxH = 95;

  // خلفية مربع الكارت
  ctx.fillStyle = "#0a1118";
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 15);
  ctx.fill();

  // إطار مربع الكارت
  ctx.strokeStyle = "#00e676"; // أخضر مضيء
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // عنوان داخل المربع
  ctx.fillStyle = "#78909c";
  ctx.font = "bold 15px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("كارت كود الشحن الخاص بك (Voucher Code)", width / 2, boxY + 30);

  // طباعة كود الكارت بخط كبير وواضح جداً
  ctx.fillStyle = "#00e676";
  ctx.font = "bold 40px monospace";
  ctx.fillText(voucherCode || "0000-0000-0000", width / 2, boxY + 75);

  // 8. التذييل (Footer) - رقم المعاملة ومعلومات الدعم
  ctx.fillStyle = "#b0bec5";
  ctx.font = "15px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`🆔 رقم العملية: ${transactionId || "N/A"}`, width - 50, 395);

  ctx.textAlign = "left";
  ctx.fillText("🌐 نتمنى لكم تجربة تصفح ممتعة", 50, 395);

  // 9. تحويل الكارت لملف PNG واستعادة Buffer
  return canvas.toBuffer("image/png");
}

module.exports = { generateCardImage };
