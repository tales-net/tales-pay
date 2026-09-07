(function () {
  // منع حقن الودجت أكثر من مرة
  if (window.HikayatChatWidgetLoaded) return;
  window.HikayatChatWidgetLoaded = true;

  // جلب الـ Socket.io من الصفحة أو تحميله تلقائياً إن لم يكن موجوداً
  function loadScript(src, callback) {
    if (document.querySelector(`script[src="${src}"]`)) {
      if (callback) callback();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = callback;
    document.head.appendChild(script);
  }

  function initWidget() {
    // توليد أو استرجاع معرف فريد للعميل (Client ID)
    let clientId = localStorage.getItem('hikayat_client_id');
    if (!clientId) {
      clientId = 'client_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      localStorage.setItem('hikayat_client_id', clientId);
    }

    // حقن التصميم (CSS) الخاص بالودجت والشات والفقاعة
    const style = document.createElement('style');
    style.innerHTML = `
      #hikayat-support-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
        font-family: 'Segoe UI', Tahoma, Cairo, sans-serif;
        direction: rtl;
      }
      #support-btn {
        display: flex;
        align-items: center;
        cursor: pointer;
        position: relative;
      }
      #support-bubble {
        position: absolute;
        right: 65px;
        background: #ffffff;
        color: #01338D;
        padding: 8px 14px;
        border-radius: 20px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.15);
        font-size: 13px;
        font-weight: bold;
        white-space: nowrap;
        animation: fadeIn 0.5s ease-in-out;
        border: 1px solid #e1e8ed;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes fadeOut {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(5px); }
      }
      #support-icon {
        width: 55px;
        height: 55px;
        background: #25D366;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(37, 211, 102, 0.4);
        transition: transform 0.3s ease;
      }
      #support-icon:hover {
        transform: scale(1.1);
      }
      #support-icon img {
        width: 32px;
        height: 32px;
        filter: brightness(0) invert(1);
      }
      
      /* نافذة الشات المنبثقة */
      #hikayat-chat-box {
        position: fixed;
        bottom: 90px;
        right: 20px;
        width: 350px;
        max-width: calc(100vw - 40px);
        height: 480px;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        display: none;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid #e1e8ed;
      }
      .chat-header {
        background: #01338D;
        color: white;
        padding: 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: bold;
      }
      .chat-header .close-chat {
        background: none;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
      }
      .chat-body {
        flex: 1;
        padding: 15px;
        overflow-y: auto;
        background: #f7f9fa;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .chat-message {
        max-width: 80%;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 13px;
        line-height: 1.4;
        word-break: break-word;
      }
      .chat-message.client {
        background: #01338D;
        color: white;
        align-self: flex-start;
        border-bottom-left-radius: 2px;
      }
      .chat-message.admin {
        background: #e4e6eb;
        color: #050505;
        align-self: flex-end;
        border-bottom-right-radius: 2px;
      }
      .chat-message img {
        max-width: 100%;
        border-radius: 8px;
        margin-top: 5px;
      }
      .chat-footer {
        padding: 10px;
        background: white;
        border-top: 1px solid #e1e8ed;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .chat-footer input[type="text"] {
        flex: 1;
        padding: 10px;
        border: 1px solid #ccd0d5;
        border-radius: 20px;
        outline: none;
        font-size: 13px;
      }
      .chat-footer input[type="file"] {
        display: none;
      }
      .chat-footer label.file-label {
        cursor: pointer;
        font-size: 18px;
        color: #65676b;
      }
      .chat-footer button.send-btn {
        background: #01338D;
        color: white;
        border: none;
        padding: 8px 15px;
        border-radius: 20px;
        cursor: pointer;
        font-weight: bold;
        font-size: 13px;
      }
      .typing-indicator {
        font-size: 11px;
        color: #65676b;
        font-style: italic;
        padding: 0 5px;
        display: none;
      }
    `;
    document.head.appendChild(style);

    // حقن HTML الخاص بالودجت في الصفحة
    const container = document.createElement('div');
    container.id = 'hikayat-support-container';
    container.innerHTML = `
      <div id="support-btn" title="تحدث معنا">
        <div id="support-bubble">💬 تحدث معنا مباشرا</div>
        <div id="support-icon">
          <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="Support">
        </div>
      </div>

      <div id="hikayat-chat-box">
        <div class="chat-header">
          <span>الدعم الفني - شبكة حكايات</span>
          <button class="close-chat">&times;</button>
        </div>
        <div class="chat-body" id="chatMessagesContainer">
          <!-- الرسائل تظهر هنا ديناميكياً -->
        </div>
        <div class="typing-indicator" id="typingIndicator">الدعم الفني يكتب الآن...</div>
        <div class="chat-footer">
          <label class="file-label" for="chatFileInput" title="إرسال صورة">📎</label>
          <input type="file" id="chatFileInput" accept="image/*">
          <input type="text" id="chatInputText" placeholder="اكتب رسالتك هنا...">
          <button class="send-btn" id="chatSendBtn">إرسال</button>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    // برمجة إظهار/إخفاء الفقاعة لمدة دقيقة كاملة (60,000 مللي ثانية)
    const supportBubble = document.getElementById('support-bubble');
    if (supportBubble) {
      supportBubble.style.display = "block";
      setTimeout(() => {
        supportBubble.style.animation = "fadeOut 0.8s ease-in-out forwards";
        setTimeout(() => { 
          supportBubble.style.display = "none"; 
        }, 800);
      }, 60000); // دقيقة كاملة
    }

    // تفعيل تفاعلات فتح وإغلاق صندوق الشات
    const supportBtn = document.getElementById('support-btn');
    const chatBox = document.getElementById('hikayat-chat-box');
    const closeChatBtn = document.querySelector('.close-chat');

    supportBtn.addEventListener('click', () => {
      chatBox.style.display = chatBox.style.display === 'flex' ? 'none' : 'flex';
      if (supportBubble) supportBubble.style.display = 'none'; // إخفاء الفقاعة فور فتح الشات
    });

    closeChatBtn.addEventListener('click', () => {
      chatBox.style.display = 'none';
    });

    // الاتصال بالـ Socket.io وإدارة المحادثة الحية
    loadScript('https://cdn.socket.io/4.5.4/socket.io.min.js', () => {
      const socket = io();

      socket.emit('join_chat', clientId);

      const messagesContainer = document.getElementById('chatMessagesContainer');
      const inputTextField = document.getElementById('chatInputText');
      const sendBtn = document.getElementById('chatSendBtn');
      const fileInput = document.getElementById('chatFileInput');
      const typingIndicator = document.getElementById('typingIndicator');

      // استقبال الرسائل الجديدة
      socket.on('new_message', (msg) => {
        appendMessage(msg);
      });

      // مؤشر الكتابة للآدمن
      socket.on('typing_status', (data) => {
        if (data.isTyping) {
          typingIndicator.style.display = 'block';
        } else {
          typingIndicator.style.display = 'none';
        }
      });

      // إغلاق المحادثة من الإدارة
      socket.on('chat_closed', (data) => {
        appendMessage({ sender: 'admin', text: data.message || 'تم إغلاق هذه المحادثة.' });
        inputTextField.disabled = true;
        sendBtn.disabled = true;
      });

      function appendMessage(msg) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${msg.sender === 'client' ? 'client' : 'admin'}`;
        
        let content = `<div>${escapeHtml(msg.text || '')}</div>`;
        if (msg.image) {
          content += `<img src="${msg.image}" alt="مرفق">`;
        }
        msgDiv.innerHTML = content;
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }

      function escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
      }

      // إرسال الرسالة عبر الـ API
      async function sendMessageToServer() {
        const text = inputTextField.value.trim();
        const file = fileInput.files[0];

        if (!text && !file) return;

        const formData = new FormData();
        formData.append('clientId', clientId);
        if (text) formData.append('message', text);
        if (file) formData.append('image', file);

        inputTextField.value = '';
        fileInput.value = '';

        try {
          const res = await fetch('/api/support/message', {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (data.closed) {
            alert('المحادثة مغلقة.');
          }
        } catch (e) {
          console.error('فشل في إرسال الرسالة:', e);
        }
      }

      sendBtn.addEventListener('click', sendMessageToServer);
      inputTextField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessageToServer();
      });
    });
  }

  // تشغيل الودجت بمجرد تحميل الصفحة بالكامل
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
