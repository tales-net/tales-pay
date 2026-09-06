const axios = require("axios");

// ذاكرة مؤقتة للرسائل المخزنة
global.supportMessagesMap = global.supportMessagesMap || new Map();

// تنظيف دوري للذاكرة المؤقتة كل نصف ساعة
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (let [key, messages] of global.supportMessagesMap.entries()) {
    if (messages.length > 0 && (Date.now() - messages[messages.length - 1].timestamp) > oneHourAgo) {
      global.supportMessagesMap.delete(key);
    }
  }
}, 30 * 60 * 1000);

class SupportEngine {
  constructor() {
    this.io = null;
    this.botToken = process.env.TELEGRAM_BOT_TOKEN;
  }

  // ربط أحداث Socket.io
  initSocket(io) {
    this.io = io;
    this.io.on("connection", (socket) => {
      socket.on("join_chat", (clientId) => {
        if (clientId) socket.join(clientId);
      });
      socket.on("join_support", (clientId) => {
        if (clientId) socket.join(clientId);
      });
    });
  }

  // إرسال رسالة العميل إلى التليجرام
  async handleClientMessage(req, res, sendSupportChatMessageFn) {
    try {
      const { message, txId, clientChatId } = req.body;
      const file = req.file;
      const clientId = clientChatId || txId || "GUEST_" + Date.now();

      await sendSupportChatMessageFn({
        text: message,
        file,
        txId: clientId,
        reply_markup: {
          inline_keyboard: [
            [{ text: "💬 رد على العميل", callback_data: `reply_${clientId}` }]
          ]
        }
      });

      let botReply = file 
        ? "✅ تم استلام صورة الإيصال! جاري التحقق وإصدار الكارت."
        : "تم استلام رسالتك بنجاح، وسنقوم بالرد عليك فوراً.";

      return res.json({ success: true, reply: botReply, clientId });
    } catch (err) {
      console.error("❌ Support Engine Error:", err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // معالجة رد الآدمن القادم من التليجرام
  async handleTelegramReply(update) {
    if (!this.io) return;

    try {
      // 1. ضغطة زر "رد على العميل"
      if (update.callback_query) {
        const callbackData = update.callback_query.data;
        const adminChatId = update.callback_query.message.chat.id;

        if (callbackData && callbackData.startsWith("reply_")) {
          const targetClientId = callbackData.replace("reply_", "");

          await axios.post(`https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`, {
            callback_query_id: update.callback_query.id
          });

          await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
            chat_id: adminChatId,
            text: `✏️ اكتب ردك الآن للعميل صاحب المعرف:\n\`${targetClientId}\`\n\n*(تأكد من عمل Reply على هذه الرسالة)*`,
            parse_mode: "Markdown",
            reply_markup: { force_reply: true }
          });
        }
      }

      // 2. إرسال رد الآدمن المكتوب للعميل
      if (update.message && update.message.reply_to_message) {
        const replyText = update.message.text;
        const originalText = update.message.reply_to_message.text || "";
        const match = originalText.match(/`([^`]+)`/);

        if (match && match[1]) {
          const targetClientId = match[1];
          const msgObject = {
            sender: "support",
            text: replyText,
            timestamp: Date.now(),
            time: new Date().toLocaleTimeString("ar-EG", { hour: '2-digit', minute: '2-digit' })
          };

          if (!global.supportMessagesMap.has(targetClientId)) {
            global.supportMessagesMap.set(targetClientId, []);
          }
          global.supportMessagesMap.get(targetClientId).push(msgObject);

          // بث مباشر للعميل عبر السوكت
          this.io.to(targetClientId).emit("receive_support_message", msgObject);
          this.io.to(targetClientId).emit("support_reply", msgObject);

          await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
            chat_id: update.message.chat.id,
            text: `✅ تم إرسال الرد بنجاح إلى العميل (\`${targetClientId}\`)`,
            parse_mode: "Markdown"
          });
        }
      }
    } catch (err) {
      console.error("❌ Telegram Reply Error:", err.message);
    }
  }

  // جلب الرسائل المخزنة للعميل
  getStoredMessages(clientId) {
    return global.supportMessagesMap.get(clientId) || [];
  }
}

module.exports = new SupportEngine();
