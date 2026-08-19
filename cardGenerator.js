import sharp from 'sharp';
import { createMikrotikUser } from './voucher.js';

/**
 * تحديد بروفايل الميكروتك بناءً على قيمة المبلغ
 * @param {number} amount 
 * @returns {{ profile: string, packageName: string }}
 */
function getProfileDetails(amount) {
    const numericAmount = parseFloat(amount) || 0;

    if (numericAmount >= 100) {
        return { profile: "25GB-Profile", packageName: "الباقة الماسية" };
    } else if (numericAmount >= 50) {
        return { profile: "10GB-Profile", packageName: "الباقة الذهبية" };
    } else if (numericAmount >= 20) {
        return { profile: "3GB-Profile", packageName: "الباقة الفضية" };
    } else {
        return { profile: "1GB-Profile", packageName: "الباقة البرونزية" };
    }
}

/**
 * رسم وإنشاء صورة الكارت بجودة عالية وصيغة JPEG مصمتة
 * @param {string} code - كود الكارت
 * @param {string} packageName - اسم الباقة
 * @param {number|string} price - السعر
 * @param {string|number} transactionId - رقم العملية
 * @returns {Promise<Buffer>}
 */
export async function generateCardImage(code, packageName, price, transactionId) {
    const safeCode = String(code || 'XXXX-XXXX-XXXX');
    const safePackageName = String(packageName || 'إنترنت');
    const safePrice = String(price || '0');
    const safeTransactionId = String(transactionId || '0000');

    const svgImage = `
    <svg width="800" height="450" xmlns="http://www.w3.org/2000/svg">
      <style>
        .title { font-family: Arial, sans-serif; font-size: 34px; font-weight: bold; fill: #f1c40f; text-anchor: middle; }
        .sub-title { font-family: Arial, sans-serif; font-size: 24px; font-weight: bold; fill: #ffffff; text-anchor: middle; }
        .code-text { font-family: 'Courier New', monospace; font-size: 42px; font-weight: bold; fill: #1e3c72; text-anchor: middle; letter-spacing: 2px; }
        .tx-id { font-family: Arial, sans-serif; font-size: 18px; fill: #9fb3c8; text-anchor: middle; }
        .footer { font-family: Arial, sans-serif; font-size: 22px; font-weight: bold; fill: #2ecc71; text-anchor: middle; }
      </style>

      <rect width="800" height="450" fill="#0f2027" />
      <rect x="20" y="20" width="760" height="410" rx="15" ry="15" fill="none" stroke="#f1c40f" stroke-width="3" opacity="0.8" />

      <text x="400" y="75" class="title">شبكة حكايات نت - HIKAYAT NET</text>
      <line x1="150" y1="95" x2="650" y2="95" stroke="#f1c40f" stroke-width="2" opacity="0.5" />

      <text x="400" y="140" class="sub-title">باقة: ${safePackageName} (${safePrice} جنيه)</text>

      <rect x="80" y="175" width="640" height="100" rx="12" ry="12" fill="#ffffff" />
      <text x="400" y="240" class="code-text">${safeCode}</text>

      <text x="400" y="335" class="tx-id">رقم العملية: #${safeTransactionId}</text>
      <text x="400" y="385" class="footer">شكراً لاستخدامكم شبكة حكايات نت</text>
    </svg>
    `;

    try {
        return await sharp(Buffer.from(svgImage))
            .jpeg({ quality: 95 })
            .toBuffer();
    } catch (error) {
        console.error('❌ [CardGenerator] خطأ أثناء إنشاء صورة الكارت:', error);
        throw error;
    }
}

/**
 * توليد الكارت وإنشاؤه في سيرفر الميكروتك وتوليد الصورة الخاصة به في خطوة واحدة
 * @param {number|string} amount - المبلغ المدفوع
 * @param {string|number} [transactionId] - رقم العملية القادم من Paymob
 * @returns {Promise<{ code: string, profile: string, packageName: string, imageBuffer: Buffer }>}
 */
export async function generateVoucher(amount, transactionId = Date.now()) {
    try {
        const { profile, packageName } = getProfileDetails(amount);

        // إنشاء كود فريد للكارت مكون من 6 أرقام
        const code = "TC-" + Math.floor(100000 + Math.random() * 900000);

        // إنشاء المستخدم داخل الميكروتك
        await createMikrotikUser(code, code, profile);

        // توليد صورة الكارت بناءً على البيانات الناتجة
        const imageBuffer = await generateCardImage(code, packageName, amount, transactionId);

        return {
            code,
            profile,
            packageName,
            amount,
            transactionId,
            imageBuffer
        };
    } catch (error) {
        console.error('❌ [CardGenerator] خطأ أثناء معالجة الكارت الشاملة:', error);
        throw error;
    }
}
