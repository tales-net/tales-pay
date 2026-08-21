/**
 * 🔒 نظام حماية الصفحة والواجهة من النسخ والتفتيش - Tales Net
 */
(function () {
  'use strict';

  // 1. منع قائمة كليك يمين (Context Menu)
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  // 2. منع اختصارات لوحة المفاتيح (عربي وإنجليزي) وأدوات المطور
  document.addEventListener('keydown', function (e) {
    const forbiddenKeys = [
      'u', 'U', 's', 'S', 'c', 'C', 'p', 'P', 'a', 'A', 'x', 'X', 'v', 'V', 'h', 'H',
      'ع', 'س', 'ؤ', 'ح', '؛', '‘', 'ٍ', '}'
    ];

    const isCtrl = e.ctrlKey || e.metaKey; // دعم أجهزة Mac أيضاً عبر metaKey

    // منع Ctrl + Shortcuts
    if (isCtrl && forbiddenKeys.includes(e.key)) {
      e.preventDefault();
    }

    // منع F12 و PrintScreen
    if (e.key === 'F12' || e.key === 'PrintScreen') {
      e.preventDefault();
    }

    // منع Ctrl + Shift + I / J / C
    if (isCtrl && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) {
      e.preventDefault();
    }
  });

  // 3. تعطيل تصوير الشاشة عبر زر PrintScreen ومسح الحافظة
  document.addEventListener('keyup', function (e) {
    if (e.key === 'PrintScreen') {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('');
      }
      alert('🚫 تم تعطيل تصوير الشاشة!');
    }
  });

  // 4. تعطيل النسخ والتحديد والسحب والقص (مع الاستثناء للحقول الإدخال)
  ['selectstart', 'copy', 'cut', 'dragstart'].forEach(function (evt) {
    document.addEventListener(evt, function (e) {
      const tagName = e.target.tagName ? e.target.tagName.toLowerCase() : '';
      // السماح بتحديد ونخس النصوص فقط داخل خانات الكتابة لراحة المستخدم
      if (tagName !== 'input' && tagName !== 'textarea') {
        e.preventDefault();
      }
    });
  });

  // 5. 🕵️‍♂️ كشف فتح أدوات المطور (DevTools Detection)
  function checkDevTools() {
    const widthThreshold = window.outerWidth - window.innerWidth > 160;
    const heightThreshold = window.outerHeight - window.innerHeight > 160;

    if (widthThreshold || heightThreshold) {
      document.body.style.filter = 'blur(30px)';
      console.clear();
    } else {
      // إزالة التغبيش إذا قام المستخدم بإغلاق أدوات المطور
      if (document.body.style.filter === 'blur(30px)') {
        document.body.style.filter = 'none';
      }
    }
  }

  setInterval(checkDevTools, 1000);

  // 6. 🔍 مراقبة التعديلات الخبيثة على الهيكل الأساسي (DOM Mutation Guard)
  window.addEventListener('DOMContentLoaded', function () {
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        // حماية العناصر الأساسية من الحذف
        if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
          mutation.removedNodes.forEach(function (node) {
            if (node.id === 'main-container' || node.tagName === 'FORM') {
              document.body.style.filter = 'blur(20px)';
              alert('🚨 تم اكتشاف محاولة تعديل هيكل الصفحة!');
            }
          });
        }
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });

})();
