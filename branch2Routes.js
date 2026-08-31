const express = require('express');
const router = express.Router();
const { getBranch2Config, testBranch2Connection } = require('./mikrotikService_branch2');
const { processPaymentAndCreateCardBranch2 } = require('./mikrotikCardService_branch2');

/**
 * 1. مسار لاختبار الاتصال بسيرفر الفرع الثاني مباشرة من المتصفح أو البوستمان
 * الرابط: GET https://tales-pay.onrender.com/branch2/test-connection
 */
router.get('/test-connection', async (req, res) => {
  try {
    const result = await testBranch2Connection();
    if (result.success) {
      return res.status(200).json({ status: 'success', message: 'تم الاتصال بنجاح بسيرفر الفرع الثاني', details: result });
    } else {
      return res.status(500).json({ status: 'error', message: 'فشل الاتصال بسيرفر الفرع الثاني', error: result.error });
    }
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
});

/**
 * 2. مسار اختبار إنشاء كارت وتفعيله للفرع الثاني (بعد نجاح الدفع)
 * الرابط: POST https://tales-pay.onrender.com/branch2/create-card-test
 * Body (JSON):
 * {
 *   "transactionId": "TXN_TEST_12345",
 *   "profileName": "name_of_profile_in_mikrotik"
 * }
 */
router.post('/create-card-test', async (req, res) => {
  const { transactionId, profileName } = req.body;

  if (!transactionId) {
    return res.status(400).json({ 
      success: false, 
      message: 'رقم المعاملة (transactionId) مطلوب لتجنب التكرار!' 
    });
  }

  if (!profileName) {
    return res.status(400).json({ 
      success: false, 
      message: 'اسم البروفايل (profileName) مطلوب!' 
    });
  }

  try {
    const routerConfig = getBranch2Config();
    const prefix = "22"; // بادئة كروت الفرع الثاني (يمكنك تغييرها)
    const delaySeconds = 10; // وقت الانتظار لاستقرار الكارت

    console.log(`🧪 [اختبار الفرع الثاني] استلام طلب إنشاء كارت للمعاملة: ${transactionId}`);

    // تنفيذ عملية إنشاء الكارت وتفعيله مع الحماية ضد التكرار لنفس رقم المعاملة
    const result = await processPaymentAndCreateCardBranch2(
      routerConfig,
      prefix,
      profileName,
      transactionId,
      delaySeconds
    );

    return res.status(200).json({
      success: true,
      message: 'تم إصدار وتفعيل كارت الفرع الثاني بنجاح',
      data: result
    });

  } catch (error) {
    console.error(`❌ [خطأ في مسار الفرع الثاني]:`, error.message);
    
    // التحقق إذا كان الخطأ بسبب تكرار المعاملة
    if (error.message.includes('Duplicate transaction')) {
      return res.status(409).json({
        success: false,
        message: 'هذه المعاملة تم معالجتها مسبقاً، وتم منع إنشاء كارت مكرر لنفس عملية الدفع.',
        error: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: 'فشل تنفيذ عملية الفرع الثاني',
      error: error.message
    });
  }
});

module.exports = router;
