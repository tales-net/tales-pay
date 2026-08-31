const { RouterOSClient } = require("routeros-client");

/**
 * إعدادات الاتصال الخاصة بـ "حكايات نت - الفرع الثالث"
 */
const branch3RouterConfig = {
  host: process.env.MIKROTIK_HOST_BRANCH3 || "YOUR_BRANCH_3_ROUTER_IP", // ضع آيبي راوتر الفرع الثالث هنا
  user: process.env.MIKROTIK_USER || "admin",                     // اسم المستخدم للميكروتيك
  password: process.env.MIKROTIK_PASSWORD || "YOUR_PASSWORD",    // كلمة المرور
  port: parseInt(process.env.MIKROTIK_BRANCH_PORT || "8728", 10),        // البورت الافتراضي لـ API
  timeout: 25
};

/**
 * دالة لاختبار الاتصال بسيرفر ميكروتيك الفرع الثالث
 */
async function testBranch3Connection() {
  const client = new RouterOSClient(branch3RouterConfig);
  try {
    console.log(`🔌 [فرع 3] جاري الاتصال بسيرفر الفرع الثالث على العنوان: ${branch3RouterConfig.host}:${branch3RouterConfig.port}...`);
    const conn = await client.connect();
    console.log(`✅ [فرع 3] تم الاتصال بنجاح بسيرفر الفرع الثالث.`);
    await client.close().catch(() => {});
    return { success: true, message: "Connected to Branch 3 successfully" };
  } catch (error) {
    if (client) await client.close().catch(() => {});
    console.error(`❌ [فرع 3] فشل الاتصال بسيرفر الفرع الثالث:`, error.message || error);
    return { success: false, error: error.message || error };
  }
}

/**
 * دالة جلب إعدادات الراوتر للفرع الثالث
 */
function getBranch3Config() {
  return branch3RouterConfig;
}

module.exports = {
  branch3RouterConfig,
  testBranch3Connection,
  getBranch3Config
};
