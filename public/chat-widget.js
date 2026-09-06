(function () {
  // تحميل مكتبة Socket.io تلقائياً إن لم تكن متوفرة
  if (typeof io === 'undefined') {
    const socketScript = document.createElement('script');
    socketScript.src = "/socket.io/socket.io.js";
    socketScript.onload = startWidget;
    socketScript.onerror = startWidget;
    document.head.appendChild(socketScript);
  } else {
    startWidget();
  }

  function startWidget() {
    const style = document.createElement('style');
    style.innerHTML = `
      .chat-bubble-btn { position: fixed; bottom: 20px; left: 20px; background: #01338D; color: white; width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); cursor: pointer; z-index: 99999; }
      .chat-widget-window { position: fixed; bottom: 85px; left: 20px; width: 320px; max-width: 90vw; background: #ffffff; border-radius: 12px; box-shadow: 0 8px 25px rgba(0,0,0,0.2); display: none; flex-direction: column; overflow: hidden; z-index: 99999; border: 1px solid #e0e0e0; font-family: sans-serif; direction: rtl; }
      .chat-widget-header { background: #01338D; color: white; padding: 12px 15px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
      .chat-widget-body { padding: 12px; height: 250px; overflow-y: auto; background: #f8f9fa; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
      .chat-msg { max-width: 80%; padding: 8px 12px; border-radius: 10px; word-break: break-word; line-height: 1.4; }
      .chat-msg.bot { background: #e9ecef; color: #333; align-self: flex-start; }
      .chat-msg.user { background: #01338D; color: white; align-self: flex-end; }
      .chat-widget-footer { padding: 8px 10px; background: #ffffff; border-top: 1px solid #eee; display: flex; gap: 6px; align-items: center; }
      .chat-widget-footer input[type="text"] { flex: 1; padding: 8px 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 12px; }
      .chat-widget-footer button { background: #27ae60; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; }
    `;
    document.head.appendChild(style);

    const widget = document.createElement('div');
    widget.innerHTML = `
      <div class="chat-bubble-btn" id="chatBubbleBtn">💬</div>
      <div class="chat-widget-window" id="chatWidgetWindow">
        <div class="chat-widget-header">
          <span>🎧 الدعم المباشر - شبكة حكايات</span>
          <span style="cursor:pointer;" id="chatCloseBtn">✕</span>
        </div>
        <div class="chat-widget-body" id="chatWidgetBody">
          <div class="chat-msg bot">أهلاً بك! يمكنك إرسال استفسارك أو صورة الإيصال هنا.</div>
        </div>
        <div class="chat-widget-footer">
          <input type="text" id="chatWidgetInput" placeholder="اكتب رسالتك..." />
          <label for="chatWidgetImage" style="cursor:pointer; font-size:18px;">📎</label>
          <input type="file" id="chatWidgetImage" accept="image/*" style="display:none;" />
          <button id="chatWidgetSend">إرسال</button>
        </div>
      </div>
    `;
    document.body.appendChild(widget);

    const urlParams = new URLSearchParams(window.location.search);
    const rawTxId = urlParams.get('id') || urlParams.get('order') || urlParams.get('merchant_order_id');
    let clientId = rawTxId || localStorage.getItem('chat_client_id');
    if (!clientId) {
      clientId = 'CLIENT_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('chat_client_id', clientId);
    }

    const bodyEl = document.getElementById('chatWidgetBody');
    const inputEl = document.getElementById('chatWidgetInput');
    const windowEl = document.getElementById('chatWidgetWindow');
    let displayedIds = new Set();

    function addMessage(sender, text) {
      const cls = sender === 'user' ? 'user' : 'bot';
      bodyEl.innerHTML += `<div class="chat-msg ${cls}">${text}</div>`;
      bodyEl.scrollTop = bodyEl.scrollHeight;
    }

    // الربط بالبث المباشر
    if (typeof io !== 'undefined') {
      const socket = io();
      socket.on('connect', () => {
        socket.emit('join_chat', clientId);
        socket.emit('join_support', clientId);
      });
      socket.on('receive_support_message', (msg) => msg?.text && addMessage('support', msg.text));
      socket.on('support_reply', (msg) => msg?.text && addMessage('support', msg.text));
    }

    // استعلام احتياطي للرسائل
    async function checkMessages() {
      try {
        const res = await fetch('/api/support/messages/' + encodeURIComponent(clientId));
        const data = await res.json();
        if (data.success && Array.isArray(data.messages)) {
          data.messages.forEach(m => {
            const key = m.timestamp + "_" + m.text;
            if (!displayedIds.has(key)) {
              displayedIds.add(key);
              addMessage('support', m.text);
            }
          });
        }
      } catch (e) {}
    }
    setInterval(checkMessages, 4000);

    const toggle = () => windowEl.style.display = (windowEl.style.display === 'flex') ? 'none' : 'flex';
    document.getElementById('chatBubbleBtn').onclick = toggle;
    document.getElementById('chatCloseBtn').onclick = toggle;

    async function sendMsg(file = null) {
      const text = inputEl.value.trim();
      if (!text && !file) return;

      if (text) { addMessage('user', text); inputEl.value = ''; }
      if (file) addMessage('user', '📷 [جاري رفع الصورة...]');

      const fd = new FormData();
      fd.append('clientChatId', clientId);
      if (text) fd.append('message', text);
      if (file) fd.append('image', file);

      try {
        const res = await fetch('/api/support/message', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.reply) addMessage('bot', data.reply);
      } catch (e) {
        addMessage('bot', '⚠️ حدث خطأ في الاتصال.');
      }
    }

    document.getElementById('chatWidgetSend').onclick = () => sendMsg();
    inputEl.onkeypress = (e) => e.key === 'Enter' && sendMsg();
    document.getElementById('chatWidgetImage').onchange = (e) => e.target.files[0] && sendMsg(e.target.files[0]);
  }
})();
