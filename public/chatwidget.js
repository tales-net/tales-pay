(function () {
  if (document.getElementById('supportWelcomeBubble')) return;

  const bubble = document.createElement('div');
  bubble.id = 'supportWelcomeBubble';
  bubble.innerHTML = '💬 تحدث معنا مباشرة';
  
  Object.assign(bubble.style, {
    position: 'fixed',
    bottom: '90px',
    right: '20px',
    backgroundColor: '#01338D',
    color: '#ffffff',
    padding: '12px 18px',
    borderRadius: '25px 25px 4px 25px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
    fontFamily: 'Segoe UI, Tahoma, Cairo, sans-serif',
    fontSize: '14px',
    fontWeight: 'bold',
    zIndex: '999999',
    cursor: 'pointer',
    direction: 'rtl',
    opacity: '0',
    transform: 'translateY(15px)',
    transition: 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
  });

  document.body.appendChild(bubble);

  // إظهار الفقاعة بعد ثانية من فتح الصفحة
  setTimeout(() => {
    bubble.style.opacity = '1';
    bubble.style.transform = 'translateY(0)';
  }, 1000);

  // عند الضغط عليها يتم فتح نافذة الشات (إن وجدت)
  bubble.onclick = function() {
    if (typeof openChatModal === 'function') {
      openChatModal();
    } else {
      const chatBtn = document.querySelector('.chat-widget-btn, #chatButton, .support-btn, [class*="chat"]');
      if (chatBtn) chatBtn.click();
    }
    removeBubble();
  };

  function removeBubble() {
    if (bubble && bubble.parentNode) {
      bubble.style.opacity = '0';
      bubble.style.transform = 'translateY(15px)';
      setTimeout(() => bubble.remove(), 500);
    }
  }

  // إخفاء الفقاعة تلقائياً بعد مرور دقيقة كاملة (60 ثانية)
  setTimeout(() => {
    removeBubble();
  }, 61000);
})();
