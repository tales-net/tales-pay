/**
 * Data.js - التعامل مع بيانات الجهاز والتحقق من صحة المدخلات
 */

// 1. توليد أو جلب معرّف العميل
function getOrCreateClientID() {
    let clientId = localStorage.getItem('hikayat_client_id');
    if (!clientId) {
        clientId = 'DEV-' + Math.random().toString(36).substring(2, 9).toUpperCase() + '-' + Date.now().toString().slice(-4);
        localStorage.setItem('hikayat_client_id', clientId);
    }
    return clientId;
}

// 2. جمع تفاصيل الجهاز والشبكة وتعبئة الخانات المخفية
async function collectDeviceDetails() {
    document.getElementById('clientID').value = getOrCreateClientID();
    document.getElementById('deviceRAM').value = (navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'غير مدعوم');
    document.getElementById('cpuCores').value = navigator.hardwareConcurrency || 'غير معروف';
    document.getElementById('screenSize').value = `${window.screen.width} x ${window.screen.height}`;
    document.getElementById('userTimeZone').value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'غير معروف';
    document.getElementById('lang').value = navigator.language || navigator.userLanguage || 'غير معروف';

    const ua = navigator.userAgent;
    let deviceType = '💻 كمبيوتر (Desktop)';
    let deviceModel = 'غير محدد';

    if (/iPhone/i.test(ua)) {
        deviceType = '📱 هاتف (iPhone)';
        deviceModel = 'Apple iPhone';
    } else if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
        deviceType = '📱 تابلت (iPad)';
        deviceModel = 'Apple iPad';
    } else if (/Android/i.test(ua)) {
        deviceType = /Mobile/i.test(ua) ? '📱 هاتف (Android)' : '📱 تابلت (Android Tablet)';
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
        deviceType = '💻 كمبيوتر (MacBook / Mac)';
    } else if (/Windows/i.test(ua)) {
        deviceType = '💻 كمبيوتر (Windows PC)';
    }

    document.getElementById('deviceType').value = deviceType;
    if (document.getElementById('deviceModel')) {
        document.getElementById('deviceModel').value = deviceModel;
    }

    if (navigator.getBattery) {
        try {
            const battery = await navigator.getBattery();
            document.getElementById('batteryInfo').value = `${Math.round(battery.level * 100)}% (${battery.charging ? 'جاري الشحن ⚡' : 'غير موصول بالكهرباء'})`;
        } catch (e) {
            document.getElementById('batteryInfo').value = 'غير متاح';
        }
    }

    try {
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) throw new Error("فشل ipapi");
        const data = await res.json();
        
        document.getElementById('geoCity').value = data.city || 'غير معروف';
        document.getElementById('geoCountry').value = data.country_name || 'غير معروف';
        document.getElementById('ispProvider').value = data.org || data.asn || 'غير معروف';
    } catch (err) {
        try {
            const fallbackRes = await fetch('https://ip-api.com/json/?fields=status,country,city,isp,org');
            const fbData = await fallbackRes.json();
            if (fbData.status === 'success') {
                document.getElementById('geoCity').value = fbData.city || 'غير معروف';
                document.getElementById('geoCountry').value = fbData.country || 'غير معروف';
                document.getElementById('ispProvider').value = fbData.isp || fbData.org || 'غير معروف';
            }
        } catch (e) {
            console.error('فشل جلب تفاصيل الموقع والشبكة');
        }
    }
}

// 3. تحويل الأرقام العربية إلى إنجليزية
function convertArabicDigitsToEnglish(str) {
    return str.replace(/[٠-٩]/g, function (d) {
        return d.charCodeAt(0) - 1632;
    });
}

// 4. الدوانل والتحقق من صحة المدخلات
function validateAmount() {
    const amountInput = document.getElementById('pay_amount');
    const val = parseFloat(amountInput.value);
    const errorElement = document.getElementById('error_amount');
    if (isNaN(val) || val <= 0) {
        amountInput.classList.add('is-invalid');
        errorElement.style.display = 'block';
        return false;
    } else {
        amountInput.classList.remove('is-invalid');
        errorElement.style.display = 'none';
        return true;
    }
}

function validatePhone() {
    const paymentMethodSelect = document.getElementById('payment_method');
    if (paymentMethodSelect.value === 'card') return true;
    const phoneInput = document.getElementById('user_phone');
    const val = phoneInput.value;
    const errorElement = document.getElementById('error_phone');
    const isValid = val.length === 11 && val.startsWith('01');

    if (!isValid) {
        phoneInput.classList.add('is-invalid');
        errorElement.style.display = 'block';
        return false;
    } else {
        phoneInput.classList.remove('is-invalid');
        errorElement.style.display = 'none';
        return true;
    }
}

function validateCardNumber() {
    const paymentMethodSelect = document.getElementById('payment_method');
    if (paymentMethodSelect.value !== 'card') return true;
    const cardNumberInput = document.getElementById('card_number');
    const rawValue = cardNumberInput.value.replace(/\s+/g, '');
    const errorElement = document.getElementById('error_card_number');
    if (rawValue.length < 16) {
        cardNumberInput.classList.add('is-invalid');
        errorElement.style.display = 'block';
        return false;
    } else {
        cardNumberInput.classList.remove('is-invalid');
        errorElement.style.display = 'none';
        return true;
    }
}

function validateMMYY() {
    const paymentMethodSelect = document.getElementById('payment_method');
    if (paymentMethodSelect.value !== 'card') return true;
    const mmyyInput = document.getElementById('mmyy');
    const val = mmyyInput.value;
    const errorElement = document.getElementById('error_mmyy');
    const regex = /^(0[1-9]|1[0-2])\/\d{2}$/;

    if (!regex.test(val)) {
        mmyyInput.classList.add('is-invalid');
        errorElement.style.display = 'block';
        return false;
    } else {
        mmyyInput.classList.remove('is-invalid');
        errorElement.style.display = 'none';
        const parts = val.split('/');
        document.getElementById('card_expiry_mm').value = parts[0];
        document.getElementById('card_expiry_yy').value = parts[1];
        return true;
    }
}

function validateCVC() {
    const paymentMethodSelect = document.getElementById('payment_method');
    if (paymentMethodSelect.value !== 'card') return true;
    const cvcInput = document.getElementById('card_cvc');
    const val = cvcInput.value;
    const errorElement = document.getElementById('error_cvc');
    if (val.length < 3) {
        cvcInput.classList.add('is-invalid');
        errorElement.style.display = 'block';
        return false;
    } else {
        cvcInput.classList.remove('is-invalid');
        errorElement.style.display = 'none';
        return true;
    }
}

function validateName() {
    const paymentMethodSelect = document.getElementById('payment_method');
    if (paymentMethodSelect.value !== 'card') return true;
    const nameInput = document.getElementById('card_name');
    const val = nameInput.value.trim();
    const errorElement = document.getElementById('error_card_name');
    if (val.length < 3) {
        nameInput.classList.add('is-invalid');
        errorElement.style.display = 'block';
        return false;
    } else {
        nameInput.classList.remove('is-invalid');
        errorElement.style.display = 'none';
        return true;
    }
}

// 5. تهيئة الأحداث والنموذج عند التحميل
document.addEventListener('DOMContentLoaded', () => {
    collectDeviceDetails();

    const paymentMethodSelect = document.getElementById('payment_method');
    const cardSection = document.getElementById('card_section');
    const phoneGroup = document.getElementById('phone_group');

    function toggleFields() {
        if (paymentMethodSelect.value === 'card') {
            cardSection.style.display = 'block';
            phoneGroup.style.display = 'none';
        } else {
            cardSection.style.display = 'none';
            phoneGroup.style.display = 'block';
        }
    }

    paymentMethodSelect.addEventListener('change', toggleFields);
    toggleFields();

    const urlParams = new URLSearchParams(window.location.search);
    const amountParam = urlParams.get('amount');
    if (amountParam) {
        document.getElementById('pay_amount').value = amountParam;
    }

    // زر إظهار/إخفاء رمز CVV
    const toggleCvvBtn = document.getElementById('toggleCvvBtn');
    if (toggleCvvBtn) {
        toggleCvvBtn.addEventListener('click', () => {
            const cardCvcInput = document.getElementById('card_cvc');
            const cvvIcon = document.getElementById('cvvIcon');
            if (cardCvcInput.type === 'password') {
                cardCvcInput.type = 'text';
                cvvIcon.classList.remove('fa-eye');
                cvvIcon.classList.add('fa-eye-slash');
            } else {
                cardCvcInput.type = 'password';
                cvvIcon.classList.remove('fa-eye-slash');
                cvvIcon.classList.add('fa-eye');
            }
        });
    }

    // إعداد مستمعي الأحداث للتحقق الآلي
    document.getElementById('pay_amount').addEventListener('input', (e) => {
        e.target.value = convertArabicDigitsToEnglish(e.target.value).replace(/[^\d.]/g, '');
        validateAmount();
    });

    document.getElementById('user_phone').addEventListener('input', (e) => {
        let val = convertArabicDigitsToEnglish(e.target.value).replace(/\D/g, '');
        if (val.length > 11) val = val.substring(0, 11);
        e.target.value = val;
        validatePhone();
    });

    document.getElementById('card_number').addEventListener('input', (e) => {
        let val = convertArabicDigitsToEnglish(e.target.value).replace(/\D/g, '');
        if (val.length > 16) val = val.substring(0, 16);
        e.target.value = val.match(/.{1,4}/g)?.join(' ') || '';
        validateCardNumber();
    });

    document.getElementById('mmyy').addEventListener('input', (e) => {
        let val = convertArabicDigitsToEnglish(e.target.value).replace(/\D/g, '');
        e.target.value = val.length >= 2 ? val.substring(0, 2) + '/' + val.substring(2, 4) : val;
        validateMMYY();
    });

    document.getElementById('card_cvc').addEventListener('input', (e) => {
        let val = convertArabicDigitsToEnglish(e.target.value).replace(/\D/g, '');
        if (val.length > 3) val = val.substring(0, 3);
        e.target.value = val;
        validateCVC();
    });

    document.getElementById('card_name').addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^a-zA-Z\s]/g, '');
        validateName();
    });

    // معالجة الإرسال
    document.getElementById("paymob_checkout").addEventListener("submit", function (e) {
        const isAmountValid = validateAmount();
        let isPhoneValid = validatePhone();
        let isCardValid = validateCardNumber();
        let isNameValid = validateName();
        let isExpiryValid = validateMMYY();
        let isCvcValid = validateCVC();

        if (!isAmountValid || !isPhoneValid || !isCardValid || !isNameValid || !isExpiryValid || !isCvcValid) {
            e.preventDefault();
            return;
        }

        const submitBtn = document.getElementById("submitButton");
        submitBtn.disabled = true;
        submitBtn.innerText = "جاري المعالجة والتحويل...";
    });
});
