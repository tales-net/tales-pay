(function () {
  // 1. حقن تنسيقات الـ CSS
  const style = document.createElement('style');
  style.innerHTML = `
    .chat-bubble-btn {
      position: fixed;
      bottom: 20px;
      left: 20px;
      background: #01338D;
      color: white;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      cursor: pointer;
      z-index: 99999;
      transition: transform 0.2s, background 0.3s;
    }
    .chat-bubble-btn:hover { transform: scale(1.08); background: #001f5c; }
    
    .chat-widget-window {
      position: fixed;
      bottom: 85px;
      left: 20px;
      width: 320px;
      max-width: 90vw;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 8px 25px rgba(0,0,0,0.2);
      display: none;
      flex-direction: column;
      overflow: hidden;
      z-index: 99999;
      border: 1px solid #e0e0e0;
      font-family: 'Segoe UI', Tahoma, Cairo, sans-serif;
      direction: rtl;
    }
    
    .chat-widget-header {
      background: #01338D;
      color: white;
      padding: 12px 15px;
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
    }
    .chat-widget-header .close-btn { cursor: pointer; font-size: 18px; }
    
    .chat-widget-body {
      padding: 12px;
      height: 250px;
      overflow-y: auto;
      background: #f8f9fa;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 13px;
    }
    
    .chat-msg {
      max-width: 80%;
      padding: 8px 12px;
      border-radius: 10px;
      word-break: break-word;
      line-height: 1.4;
    }
    .chat-msg.bot { background: #e9ecef; color: #333; align-self: flex-start; }
    .chat-msg.user { background: #01338D; color: white; align-self: flex-end; }
    
    .chat-widget-footer {
      padding: 8px 10px;
      background: #ffffff;
      border-top: 1px solid #eee;
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .chat-widget-footer input[type="text"] {
      flex: 1;
      padding: 8px 10px;
      border: 1px solid #ccc;
      border-radius: 6px;
      outline: none;
      font-size: 12px;
    }
    .chat-widget-footer label { cursor: pointer; color: #01338D; font-size: 18px; padding: 0 4px; }
    .chat-widget-footer button {
      background: #27ae60;
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);

  // 2. إنشاء عناصر الـ HTML بالصفحة آلياً
  const widgetContainer = document.createElement('div');
  widgetContainer.innerHTML = `
    <div class="chat-bubble-btn" id="chatBubbleBtn" title="الدعم المباشر">💬</div>
    <div class="chat-widget-window" id="chatWidgetWindow">
      <div class="chat-widget-header">
        <span>🎧 الدعم المباشر - شبكة حكايات</span>
        <span class="close-btn" id="chatCloseBtn">✕</span>
      </div>
      <div class="chat-widget-body" id="chatWidgetBody">
        <div class="chat-msg bot">أهلاً بك! يمكنك إرسال أية استفسارات أو إرسال صورة الإيصال لتأكيد عملية الدفع.</div>
      </div>
      <div class="chat-widget-footer">
        <input type="text" id="chatWidgetInput" placeholder="اكتب رسالتك..." />
        <label for="chatWidgetImage" title="إرفاق صورة">📎</label>
        <input type="file" id="chatWidgetImage" accept="image/*" style="display:none;" />
        <button id="chatWidgetSend">إرسال</button>
      </div>
    </div>
  `;
  document.body.appendChild(widgetContainer);

  // 3. ربط الأحداث والأوامر
  const bubbleBtn = document.getElementById('chatBubbleBtn');
  const windowEl = document.getElementById('chatWidgetWindow');
  const closeBtn = document.getElementById('chatCloseBtn');
  const sendBtn = document.getElementById('chatWidgetSend');
  const inputEl = document.getElementById('chatWidgetInput');
  const imageInput = document.getElementById('chatWidgetImage');
  const bodyEl = document.getElementById('chatWidgetBody');

  // إحضار Transaction ID إن وجد في رابط الصفحة
  const urlParams = new URLSearchParams(window.location.search);
  const txId = urlParams.get('id') || urlParams.get('order') || urlParams.get('merchant_order_id') || 'عام';

  function toggleChat() {
    windowEl.style.display = (windowEl.style.display === 'flex') ? 'none' : 'flex';
  }

  bubbleBtn.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', toggleChat);

  async function handleSend(file = null) {
    const text = inputEl.value.trim();
    if (!text && !file) return;

    if (text) {
      bodyEl.innerHTML += `<div class="chat-msg user">${text}</div>`;
      inputEl.value = '';
    }
    if (file) {
      bodyEl.innerHTML += `<div class="chat-msg user">📷 [جاري رفع الصورة...]</div>`;
    }

    bodyEl.scrollTop = bodyEl.scrollHeight;

    const formData = new FormData();
    formData.append('txId', txId);
    if (text) formData.append('message', text);
    if (file) formData.append('image', file);

    try {
      const response = await fetch('/api/support/message', {
        method: 'POST',
        body: formData
      });
      const resData = await response.json();

      if (resData.success && resData.reply) {
        bodyEl.innerHTML += `<div class="chat-msg bot">${resData.reply}</div>`;
      } else {
        bodyEl.innerHTML += `<div class="chat-msg bot">تم استقبال طلبك بنجاح وسيرد عليك الدعم قريباً.</div>`;
      }
    } catch (e) {
      bodyEl.innerHTML += `<div class="chat-msg bot">⚠️ حدث خطأ في الاتصال بالسيرفر.</div>`;
    }
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }

  sendBtn.addEventListener('click', () => handleSend());
  inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
  });

  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleSend(file);
  });
})();
