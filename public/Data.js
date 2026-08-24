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

// دالة مساعدة لتحديث قيمة عنصر في النموذج بأمان
function setElementValue(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.value = value;
  }
}

// 2. جمع تفاصيل الجهاز والشبكة وتعبئة الخانات المخفية
async function collectDeviceDetails() {
  setElementValue('clientID', getOrCreateClientID());
  setElementValue('deviceRAM', navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'غير مدعوم');
  setElementValue('cpuCores', navigator.hardwareConcurrency || 'غير معروف');
  setElementValue('screenSize', `${window.screen.width} x ${window.screen.height}`);
  setElementValue('userTimeZone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'غير معروف');
  setElementValue('lang', navigator.language || navigator.userLanguage || 'غير معروف');

  // جلب معلومات البطارية
  if (navigator.getBattery) {
    try {
      const battery = await navigator.getBattery();
      setElementValue('batteryInfo', `${Math.round(battery.level * 100)}% (${battery.charging ? 'جاري الشحن ⚡' : 'غير موصول بالكهرباء'})`);
    } catch (e) {
      setElementValue('batteryInfo', 'غير متاح');
    }
  } else {
    setElementValue('batteryInfo', 'غير متاح');
  }

  // جلب معلومات الـ IP والجغرافيا
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) throw new Error("فشل ipapi");
    const data = await res.json();

    setElementValue('geoCity', data.city || 'غير معروف');
    setElementValue('geoCountry', data.country_name || 'غير معروف');
    setElementValue('ispProvider', data.org || data.asn || 'غير معروف');
  } catch (err) {
    try {
      const fallbackRes = await fetch('https://ip-api.com/json/?fields=status,country,city,isp,org');
      const fbData = await fallbackRes.json();
      if (fbData.status === 'success') {
        setElementValue('geoCity', fbData.city || 'غير معروف');
        setElementValue('geoCountry', fbData.country || 'غير معروف');
        setElementValue('ispProvider', fbData.isp || fbData.org || 'غير معروف');
      }
    } catch (e) {
      console.warn('⚠️ تعذر جلب تفاصيل الموقع والشبكة محلياً');
    }
  }
}

// 3. تحويل الأرقام العربية إلى إنجليزية
function convertArabicDigitsToEnglish(str) {
  if (!str) return '';
  return str.replace(/[٠-٩]/g, function (d) {
    return d.charCodeAt(0) - 1632;
  });
}

// 4. التحقق من صحة المدخلات
function validateAmount() {
  const amountInput = document.getElementById('pay_amount');
  if (!amountInput) return true;
  const val = parseFloat(amountInput.value);
  const errorElement = document.getElementById('error_amount');
  
  if (isNaN(val) || val <= 0) {
    amountInput.classList.add('is-invalid');
    if (errorElement) errorElement.style.display = 'block';
    return false;
  } else {
    amountInput.classList.remove('is-invalid');
    if (errorElement) errorElement.style.display = 'none';
    return true;
  }
}

function validatePhone() {
  const paymentMethodSelect = document.getElementById('payment_method');
  if (paymentMethodSelect && paymentMethodSelect.value === 'card') return true;
  
  const phoneInput = document.getElementById('user_phone');
  if (!phoneInput) return true;
  const val = phoneInput.value;
  const errorElement = document.getElementById('error_phone');
  const isValid = val.length === 11 && val.startsWith('01');

  if (!isValid) {
    phoneInput.classList.add('is-invalid');
    if (errorElement) errorElement.style.display = 'block';
    return false;
  } else {
    phoneInput.classList.remove('is-invalid');
    if (errorElement) errorElement.style.display = 'none';
    return true;
  }
}

function validateCardNumber() {
  const paymentMethodSelect = document.getElementById('payment_method');
  if (paymentMethodSelect && paymentMethodSelect.value !== 'card') return true;
  
  const cardNumberInput = document.getElementById('card_number');
  if (!cardNumberInput) return true;
  const rawValue = cardNumberInput.value.replace(/\s+/g, '');
  const errorElement = document.getElementById('error_card_number');
  
  if (rawValue.length < 16) {
    cardNumberInput.classList.add('is-invalid');
    if (errorElement) errorElement.style.display = 'block';
    return false;
  } else {
    cardNumberInput.classList.remove('is-invalid');
    if (errorElement) errorElement.style.display = 'none';
    return true;
  }
}

function validateMMYY() {
  const paymentMethodSelect = document.getElementById('payment_method');
  if (paymentMethodSelect && paymentMethodSelect.value !== 'card') return true;
  
  const mmyyInput = document.getElementById('mmyy');
  if (!mmyyInput) return true;
  const val = mmyyInput.value;
  const errorElement = document.getElementById('error_mmyy');
  const regex = /^(0[1-9]|1[0-2])\/\d{2}$/;

  if (!regex.test(val)) {
    mmyyInput.classList.add('is-invalid');
    if (errorElement) errorElement.style.display = 'block';
    return false;
  } else {
    mmyyInput.classList.remove('is-invalid');
    if (errorElement) errorElement.style.display = 'none';
    const parts = val.split('/');
    setElementValue('card_expiry_mm', parts[0]);
    setElementValue('card_expiry_yy', parts[1]);
    return true;
  }
}

function validateCVC() {
  const paymentMethodSelect = document.getElementById('payment_method');
  if (paymentMethodSelect && paymentMethodSelect.value !== 'card') return true;
  
  const cvcInput = document.getElementById('card_cvc');
  if (!cvcInput) return true;
  const val = cvcInput.value;
  const errorElement = document.getElementById('error_cvc');
  
  if (val.length < 3) {
    cvcInput.classList.add('is-invalid');
    if (errorElement) errorElement.style.display = 'block';
    return false;
  } else {
    cvcInput.classList.remove('is-invalid');
    if (errorElement) errorElement.style.display = 'none';
    return true;
  }
}

function validateName() {
  const paymentMethodSelect = document.getElementById('payment_method');
  if (paymentMethodSelect && paymentMethodSelect.value !== 'card') return true;
  
  const nameInput = document.getElementById('card_name');
  if (!nameInput) return true;
  const val = nameInput.value.trim();
  const errorElement = document.getElementById('error_card_name');
  
  if (val.length < 3) {
    nameInput.classList.add('is-invalid');
    if (errorElement) errorElement.style.display = 'block';
    return false;
  } else {
    nameInput.classList.remove('is-invalid');
    if (errorElement) errorElement.style.display = 'none';
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
    if (!paymentMethodSelect) return;
    if (paymentMethodSelect.value === 'card') {
      if (cardSection) cardSection.style.display = 'block';
      if (phoneGroup) phoneGroup.style.display = 'none';
    } else {
      if (cardSection) cardSection.style.display = 'none';
      if (phoneGroup) phoneGroup.style.display = 'block';
    }
  }

  if (paymentMethodSelect) {
    paymentMethodSelect.addEventListener('change', toggleFields);
    toggleFields();
  }

  const urlParams = new URLSearchParams(window.location.search);
  const amountParam = urlParams.get('amount');
  if (amountParam && document.getElementById('pay_amount')) {
    document.getElementById('pay_amount').value = amountParam;
  }

  // زر إظهار/إخفاء رمز CVV
  const toggleCvvBtn = document.getElementById('toggleCvvBtn');
  if (toggleCvvBtn) {
    toggleCvvBtn.addEventListener('click', () => {
      const cardCvcInput = document.getElementById('card_cvc');
      const cvvIcon = document.getElementById('cvvIcon');
      if (cardCvcInput) {
        if (cardCvcInput.type === 'password') {
          cardCvcInput.type = 'text';
          if (cvvIcon) {
            cvvIcon.classList.remove('fa-eye');
            cvvIcon.classList.add('fa-eye-slash');
          }
        } else {
          cardCvcInput.type = 'password';
          if (cvvIcon) {
            cvvIcon.classList.remove('fa-eye-slash');
            cvvIcon.classList.add('fa-eye');
          }
        }
      }
    });
  }

  // إعداد مستمعي الأحداث للتحقق الآلي
  const payAmountEl = document.getElementById('pay_amount');
  if (payAmountEl) {
    payAmountEl.addEventListener('input', (e) => {
      e.target.value = convertArabicDigitsToEnglish(e.target.value).replace(/[^\d.]/g, '');
      validateAmount();
    });
  }

  const userPhoneEl = document.getElementById('user_phone');
  if (userPhoneEl) {
    userPhoneEl.addEventListener('input', (e) => {
      let val = convertArabicDigitsToEnglish(e.target.value).replace(/\D/g, '');
      if (val.length > 11) val = val.substring(0, 11);
      e.target.value = val;
      validatePhone();
    });
  }

  const cardNumberEl = document.getElementById('card_number');
  if (cardNumberEl) {
    cardNumberEl.addEventListener('input', (e) => {
      let val = convertArabicDigitsToEnglish(e.target.value).replace(/\D/g, '');
      if (val.length > 16) val = val.substring(0, 16);
      e.target.value = val.match(/.{1,4}/g)?.join(' ') || '';
      validateCardNumber();
    });
  }

  const mmyyEl = document.getElementById('mmyy');
  if (mmyyEl) {
    mmyyEl.addEventListener('input', (e) => {
      let val = convertArabicDigitsToEnglish(e.target.value).replace(/\D/g, '');
      e.target.value = val.length >= 2 ? val.substring(0, 2) + '/' + val.substring(2, 4) : val;
      validateMMYY();
    });
  }

  const cardCvcEl = document.getElementById('card_cvc');
  if (cardCvcEl) {
    cardCvcEl.addEventListener('input', (e) => {
      let val = convertArabicDigitsToEnglish(e.target.value).replace(/\D/g, '');
      if (val.length > 3) val = val.substring(0, 3);
      e.target.value = val;
      validateCVC();
    });
  }

  const cardNameEl = document.getElementById('card_name');
  if (cardNameEl) {
    cardNameEl.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^a-zA-Z\s]/g, '');
      validateName();
    });
  }

  // معالجة الإرسال
  const formEl = document.getElementById("paymob_checkout");
  if (formEl) {
    formEl.addEventListener("submit", function (e) {
      const isAmountValid = validateAmount();
      const isPhoneValid = validatePhone();
      const isCardValid = validateCardNumber();
      const isNameValid = validateName();
      const isExpiryValid = validateMMYY();
      const isCvcValid = validateCVC();

      if (!isAmountValid || !isPhoneValid || !isCardValid || !isNameValid || !isExpiryValid || !isCvcValid) {
        e.preventDefault();
        return;
      }

      const submitBtn = document.getElementById("submitButton");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "جاري المعالجة والتحويل...";
      }
    });
  }
});
