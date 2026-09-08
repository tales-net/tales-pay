(function () {
  let clientId = localStorage.getItem("hikayat_client_id");
  if (!clientId) {
    clientId = "client_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();
    localStorage.setItem("hikayat_client_id", clientId);
  }

  const chatStyle = document.createElement("style");
  chatStyle.innerHTML = `
    #hikayat-chat-bubble { position: fixed; bottom: 20px; right: 20px; background: #01338D; color: white; width: 55px; height: 55px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 99999; font-size: 24px; transition: transform 0.2s; }
    #hikayat-chat-bubble:hover { transform: scale(1.05); }
    #hikayat-chat-box { position: fixed; bottom: 90px; right: 20px; width: 340px; height: 480px; background: white; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); display: none; flex-direction: column; z-index: 99999; direction: rtl; font-family: Tahoma, Cairo, sans-serif; overflow: hidden; border: 1px solid #e0e0e0; }
    #hikayat-chat-header { background: #01338D; color: white; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 15px; }
    #hikayat-chat-close { background: none; border: none; color: white; font-size: 18px; cursor: pointer; }
    
    #hikayat-queue-banner { background: #fff3cd; color: #856404; padding: 8px 12px; font-size: 12px; text-align: center; border-bottom: 1px solid #ffeeba; display: none; font-weight: bold; }

    #hikayat-chat-messages { flex: 1; padding: 12px; overflow-y: auto; background: #f9f9f9; display: flex; flex-direction: column; gap: 8px; }
    .hikayat-msg { padding: 8px 12px; border-radius: 8px; max-width: 80%; font-size: 13px; word-break: break-word; line-height: 1.4; }
    .hikayat-msg.client { background: #01338D; color: white; align-self: flex-start; }
    .hikayat-msg.admin { background: #e4e6eb; color: #333; align-self: flex-end; }
    .hikayat-msg img { max-width: 100%; border-radius: 6px; margin-top: 5px; }
    #hikayat-chat-input-area { padding: 10px; background: white; border-top: 1px solid #ddd; display: flex; gap: 6px; align-items: center; }
    #hikayat-chat-input { flex: 1; padding: 8px 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 13px; outline: none; }
    #hikayat-chat-send, #hikayat-chat-img-btn { background: #01338D; color: white; border: none; width: 38px; height: 38px; border-radius: 6px; cursor: pointer; font-size: 15px; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
    #hikayat-chat-send:hover, #hikayat-chat-img-btn:hover { background: #002266; }
    #hikayat-chat-img-input { display: none; }
    .chat-notice { background: #f8d7da; color: #721c24; padding: 8px; border-radius: 6px; text-align: center; font-size: 12px; margin: 5px 0; }
    #hikayat-typing-indicator { padding: 6px 12px; color: #666; font-size: 12px; font-style: italic; display: none; align-self: flex-end; background: #eee; border-radius: 12px; margin-bottom: 5px; }
  `;
  document.head.appendChild(chatStyle);

  const chatHTML = `
    <div id="hikayat-chat-bubble" title="الدعم المباشر">💬</div>
    <div id="hikayat-chat-box">
      <div id="hikayat-chat-header">
        <span>الدعم الفني المباشر</span>
        <button id="hikayat-chat-close">&times;</button>
      </div>
      <div id="hikayat-queue-banner">⏳ رقم الانتظار: <span id="queue-number-text">--</span> | المتبقي: <span id="queue-timer-text">--</span></div>
      <div id="hikayat-chat-messages">
        <div id="hikayat-typing-indicator">الدعم الفني يكتب الآن...</div>
      </div>
      <div id="hikayat-chat-input-area">
        <label id="hikayat-chat-img-btn" for="hikayat-chat-img-input" title="رفع صورة">📷</label>
        <input type="file" id="hikayat-chat-img-input" accept="image/*">
        <input type="text" id="hikayat-chat-input" placeholder="اكتب رسالتك هنا...">
        <button id="hikayat-chat-send" title="إرسال">📤</button>
      </div>
    </div>
  `;
  const container = document.createElement("div");
  container.innerHTML = chatHTML;
  document.body.appendChild(container);

  if (typeof io === "undefined") {
    const script = document.createElement("script");
    script.src = "https://cdn.socket.io/4.7.2/socket.io.min.js";
    script.onload = initSocketConnection;
    document.head.appendChild(script);
  } else {
    initSocketConnection();
  }

  let socket = null;
  let countdownInterval = null;

  function initSocketConnection() {
    socket = io();
    socket.emit("join_chat", clientId);

    socket.on("new_message", (data) => {
      hideTypingIndicator();
      appendMessage(data.sender, data.text, data.image);
    });

    socket.on("typing_status", (data) => {
      if (data.isTyping) {
        showTypingIndicator();
      } else {
        hideTypingIndicator();
      }
    });

    socket.on("chat_closed", (data) => {
      lockChatInterface(data.message || "تم إغلاق المحادثة بواسطة الدعم الفني.");
      setTimeout(() => {
        localStorage.removeItem("hikayat_client_id");
        localStorage.removeItem("hikayat_queue_end_time");
        localStorage.removeItem("hikayat_queue_number");
      }, 3000);
    });

    socket.on("start_queue_countdown", (data) => {
      const totalSeconds = data.minutes * 60;
      const queueNumber = data.queueNumber || Math.floor(Math.random() * 8) + 2;
      const endTime = Date.now() + (totalSeconds * 1000);

      localStorage.setItem("hikayat_queue_end_time", endTime);
      localStorage.setItem("hikayat_queue_number", queueNumber);

      startFakeCountdown(endTime, queueNumber);
    });

    fetchMessages();
    checkExistingQueue();
  }

  const bubble = document.getElementById("hikayat-chat-bubble");
  const box = document.getElementById("hikayat-chat-box");
  const closeBtn = document.getElementById("hikayat-chat-close");
  const input = document.getElementById("hikayat-chat-input");
  const sendBtn = document.getElementById("hikayat-chat-send");
  const imgInput = document.getElementById("hikayat-chat-img-input");
  const messagesContainer = document.getElementById("hikayat-chat-messages");
  const typingIndicator = document.getElementById("hikayat-typing-indicator");
  const queueBanner = document.getElementById("hikayat-queue-banner");
  const queueTimerText = document.getElementById("queue-timer-text");
  const queueNumberText = document.getElementById("queue-number-text");

  function toggleChat() {
    box.style.display = box.style.display === "flex" ? "none" : "flex";
  }

  bubble.onclick = toggleChat;
  closeBtn.onclick = () => { box.style.display = "none"; };

  function showTypingIndicator() {
    if (typingIndicator) {
      typingIndicator.style.display = "block";
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  function hideTypingIndicator() {
    if (typingIndicator) {
      typingIndicator.style.display = "none";
    }
  }

  function appendMessage(sender, text, imageUrl) {
    const div = document.createElement("div");
    div.className = `hikayat-msg ${sender}`;
    let content = "";
    if (text) content += `<div>${escapeHtml(text)}</div>`;
    if (imageUrl) content += `<img src="${imageUrl}" alt="صورة مرفقة">`;
    div.innerHTML = content;
    
    messagesContainer.insertBefore(div, typingIndicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function checkExistingQueue() {
    const savedEndTime = localStorage.getItem("hikayat_queue_end_time");
    const savedQueueNum = localStorage.getItem("hikayat_queue_number");

    if (savedEndTime) {
      const remainingTime = parseInt(savedEndTime, 10);
      if (remainingTime > Date.now()) {
        startFakeCountdown(remainingTime, savedQueueNum || 5);
      } else {
        localStorage.removeItem("hikayat_queue_end_time");
        localStorage.removeItem("hikayat_queue_number");
      }
    }
  }

  function startFakeCountdown(endTime, queueNumber) {
    queueBanner.style.display = "block";
    queueNumberText.innerText = `#${queueNumber}`;

    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
      const now = Date.now();
      const remainingSeconds = Math.floor((endTime - now) / 1000);

      if (remainingSeconds <= 0) {
        clearInterval(countdownInterval);
        localStorage.removeItem("hikayat_queue_end_time");
        localStorage.removeItem("hikayat_queue_number");

        queueBanner.style.backgroundColor = "#d4edda";
        queueBanner.style.color = "#155724";
        queueBanner.innerHTML = "✅ تم انتهاء وقت الانتظار. يرجى الانتظار لحظات للرد عليكم من فريق الدعم الفني!";
        
        setTimeout(() => { 
          queueBanner.style.display = "none"; 
          showWelcomeBubbleAfterQueue();
        }, 4000);
        return;
      }

      let mins = Math.floor(remainingSeconds / 60);
      let secs = remainingSeconds % 60;
      queueTimerText.innerText = `${mins} دقيقة و ${secs < 10 ? '0' : ''}${secs} ثانیه`;
    }, 1000);
  }

  function fetchMessages() {
    fetch(`/api/support/messages/${clientId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.messages) {
          messagesContainer.innerHTML = '<div id="hikayat-typing-indicator">الدعم الفني يكتب الآن...</div>';
          data.messages.forEach(m => appendMessage(m.sender, m.text, m.image));
        }
      }).catch(err => console.log(err));
  }

  function lockChatInterface(reason) {
    input.disabled = true;
    input.placeholder = reason;
    imgInput.disabled = true;
    sendBtn.disabled = true;

    const notice = document.createElement("div");
    notice.className = "chat-notice";
    notice.innerText = reason;
    messagesContainer.insertBefore(notice, typingIndicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function sendPayload(text, file) {
    const formData = new FormData();
    formData.append("clientId", clientId);
    if (text) formData.append("message", text);
    if (file) formData.append("image", file);

    fetch("/api/support/message", {
      method: "POST",
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      if (data.closed) {
        lockChatInterface(data.message);
      } else if (!data.success) {
        alert("فشل إرسال الرسالة");
      }
    })
    .catch(err => console.error(err));
  }

  function handleSend() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendPayload(text, null);
  }

  sendBtn.onclick = handleSend;
  input.onkeypress = (e) => { 
    if (e.key === "Enter") {
      handleSend();
    }
  };

  imgInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    sendPayload("", file);
    imgInput.value = "";
  };

  function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  // ظهور فقاعة الترحيب العائمة بعد انتهاء مهلة الانتظار
  function showWelcomeBubbleAfterQueue() {
    if (document.getElementById('supportWelcomeBubble')) return;

    const welcomeBubble = document.createElement('div');
    welcomeBubble.id = 'supportWelcomeBubble';
    welcomeBubble.innerHTML = '💬 تحدث معنا مباشرة، ممثل الدعم جاهز للرد!';
    
    Object.assign(welcomeBubble.style, {
      position: 'fixed', bottom: '85px', right: '20px', backgroundColor: '#01338D', color: '#ffffff',
      padding: '10px 16px', borderRadius: '20px 20px 2px 20px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
      fontFamily: 'Segoe UI, Tahoma, Cairo, sans-serif', fontSize: '13px', fontWeight: 'bold',
      zIndex: '999998', cursor: 'pointer', direction: 'rtl', opacity: '0', transform: 'translateY(15px)',
      transition: 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    });

    document.body.appendChild(welcomeBubble);

    setTimeout(() => {
      welcomeBubble.style.opacity = '1';
      welcomeBubble.style.transform = 'translateY(0)';
    }, 300);

    welcomeBubble.onclick = function() {
      toggleChat();
      removeWelcomeBubble();
    };

    function removeWelcomeBubble() {
      if (welcomeBubble && welcomeBubble.parentNode) {
        welcomeBubble.style.opacity = '0';
        welcomeBubble.style.transform = 'translateY(15px)';
        setTimeout(() => welcomeBubble.remove(), 500);
      }
    }

    setTimeout(() => { removeWelcomeBubble(); }, 40000);
  }
})();
