const axios = require("axios");
const FormData = require("form-data");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ذاكرة مؤقتة لتخزين المحادثات وحالاتها
const chatSessions = global.chatSessions || new Map();
global.chatSessions = chatSessions;

const chatStatuses = global.chatStatuses || new Map();
global.chatStatuses = chatStatuses;

// خريطة لربط معرف رسالة التليجرام بمعرف العميل لتسهيل الرد المباشر
const telegramToClientMap = global.telegramToClientMap || new Map();
global.telegramToClientMap = telegramToClientMap;

function initSocket(io) {
  io.on("connection", (socket) => {
    socket.on("join_chat", (clientId) => {
      if (clientId) {
        socket.join(clientId);
        
        // إرسال رسالة ترحيبية تلقائية إذا كانت المحادثة جديدة ولا توجد رسائل سابقة
        if (!chatSessions.has(clientId) || chatSessions.get(clientId).length === 0) {
          const welcomeMsg = {
            sender: "admin",
            text: "مرحباً بك في شبكة حكايات 🌐\nكيف يمكننا مساعدتك اليوم؟ يمكنك إرسال استفسارك أو رفع صورة المشكلة وسيقوم فريق الدعم بالرد عليك في أقرب وقت.",
            timestamp: new Date()
          };
          
          if (!chatSessions.has(clientId)) {
            chatSessions.set(clientId, []);
          }
          chatSessions.get(clientId).push(welcomeMsg);
          socket.emit("new_message", welcomeMsg);
        }
      }
    });
  });
  global.ioInstance = io;
}

// معالجة رسالة العميل وإرسالها لتليجرام (سواء نص أو صورة مباشرة)
async function handleClientMessage(req, res, sendSupportChatMessageFunc) {
  try {
    const clientId = req.body.clientId || req.body.clientID;
    const messageText = req.body.message || "";
    const imageFile = req.file;

    if (!clientId) {
      return res.status(400).json({ success: false, message: "معرف العميل مفقود" });
    }

    // التحقق هل المحادثة مغلقة؟
    if (chatStatuses.get(clientId) === "closed") {
      return res.status(403).json({ 
        success: false, 
        closed: true, 
        message: "تم إغلاق هذه المحادثة من قبل الدعم الفني." 
      });
    }

    // شرط جديد: إذا لم يكن هناك نص ولا صورة مرفقة، نرفض الطلب
    if (!messageText.trim() && !imageFile) {
      return res.status(400).json({ success: false, message: "لا يمكن إرسال رسالة فارغة" });
    }

    if (!chatSessions.has(clientId)) {
      chatSessions.set(clientId, []);
    }

    let imageUrl = null;
    let imageBuffer = null;

    if (imageFile) {
      imageBuffer = imageFile.buffer;
      imageUrl = `data:${imageFile.mimetype};base64,${imageFile.buffer.toString("base64")}`;
    }

    const messageObj = {
      sender: "client",
      text: messageText,
      image: imageUrl,
      timestamp: new Date()
    };

    chatSessions.get(clientId).push(messageObj);

    // إرسال الإشعار لجروب التليجرام مع أزرار (رد / إغلاق)
    const telegramMsgId = await sendSupportChatMessageFunc(clientId, messageText, imageBuffer);
    if (telegramMsgId) {
      telegramToClientMap.set(String(telegramMsgId), clientId);
    }

    // بث الرسالة للسوكيت إن وجد
    if (global.ioInstance) {
      global.ioInstance.to(clientId).emit("new_message", messageObj);
    }

    return res.json({ success: true, message: "تم إرسال الرسالة بنجاح" });
  } catch (err) {
    console.error("❌ خطأ في معالجة رسالة العميل:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// دالة إرسال الرسالة إلى تليجرام مع الأزرار التفاعلية
async function sendSupportChatMessage(clientId, messageText, imageBuffer = null) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) return null;

    const headerText = `💬 <b>رسالة دعم جديدة من العميل</b>\n` +
                       `🆔 معرف العميل: <code>${clientId}</code>\n` +
                       `----------------------------------------\n`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "✍️ أكتب الرد", callback_data: `reply_${clientId}` },
          { text: "🔒 إغلاق الشات", callback_data: `close_${clientId}` }
        ]
      ]
    };

    let response;
    if (imageBuffer) {
      const form = new FormData();
      form.append("chat_id", CHAT_ID);
      form.append("photo", imageBuffer, {
        filename: `support_${clientId}.png`,
        contentType: "image/png"
      });
      form.append("caption", headerText + (messageText ? `📝 النص: ${messageText}` : "📷 صورة مرفقة بدون نص"));
      form.append("parse_mode", "HTML");
      form.append("reply_markup", JSON.stringify(replyMarkup));

      response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, form, {
        headers: { ...form.getHeaders() }
      });
    } else {
      response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: headerText + (messageText || "صورة مرسلة"),
        parse_mode: "HTML",
        reply_markup: replyMarkup
      });
    }

    return response.data?.result?.message_id;
  } catch (err) {
    console.error("❌ Telegram Send Error:", err.response?.data || err.message);
    return null;
  }
}

// معالجة ردود الآدمن من تليجرام
async function handleTelegramReply(body) {
  try {
    // 1. التعامل مع ضغط الأزرار (Callback Query)
    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const data = callbackQuery.data;
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;
      const originalMessage = callbackQuery.message;

      // أ) الضغط على زر "أكتب الرد" -> إعلام العميل أن الآدمن يكتب الآن + فتح Force Reply
      if (data.startsWith("reply_")) {
        const clientId = data.replace("reply_", "");
        
        // إعلام العميل عبر Socket.io أن الدعم بدأ الكتابة (تظهر نقاط...)
        if (global.ioInstance) {
          global.ioInstance.to(clientId).emit("admin_typing", { typing: true });
        }

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          callback_query_id: callbackQuery.id,
          text: "✍️ تم تنبيه العميل بأنك تكتب الرد الآن..."
        });

        // إرسال رسالة توجيهية للآدمن مع تفعيل Force Reply
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `👉 أكتب ردك الآن للعميل (معرف العميل: ${clientId}):\n(قم بالرد مباشرة على هذه الرسالة أو اكتب رسالتك)`,
          reply_to_message_id: originalMessage.message_id,
          reply_markup: {
            force_reply: true,
            input_field_placeholder: `اكتب الرد للعميل ${clientId}...`
          }
        });
        return;
      }

      // ب) الضغط على زر "إغلاق الشات"
      if (data.startsWith("close_")) {
        const clientId = data.replace("close_", "");
        chatStatuses.set(clientId, "closed");

        if (global.ioInstance) {
          global.ioInstance.to(clientId).emit("chat_closed", { message: "تم إغلاق المحادثة من قبل الدعم الفني." });
        }

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          callback_query_id: callbackQuery.id,
          text: "🔒 تم إغلاق الشات بنجاح وإيقاف العميل عن الكتابة."
        });

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [[{ text: "🔒 المحادثة مغلقة حالياً", callback_data: "closed" }]] }
        });
      }
      return;
    }

    // 2. التعامل مع ردود الآدمن النصية أو الصور المرسلة من تليجرام
    const message = body.message;
    if (!message) return;

    let clientId = null;
    let replyText = message.text || message.caption || "";

    if (message.reply_to_message) {
      const repliedMsgId = String(message.reply_to_message.message_id);
      clientId = telegramToClientMap.get(repliedMsgId);

      if (!clientId && message.reply_to_message.text) {
        const match = message.reply_to_message.text.match(/معرف العميل:\s*([a-zA-Z0-9_-]+)/);
        if (match) clientId = match[1];
      }
      if (!clientId && message.reply_to_message.caption) {
        const match = message.reply_to_message.caption.match(/معرف العميل:\s*([a-zA-Z0-9_-]+)/);
        if (match) clientId = match[1];
      }
    }

    if (!clientId && message.reply_to_message && message.reply_to_message.text) {
      const match = message.reply_to_message.text.match(/معرف العميل:\s*([a-zA-Z0-9_-]+)/);
      if (match) clientId = match[1];
    }

    if (clientId) {
      if (chatStatuses.get(clientId) === "closed") {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: message.chat.id,
          text: "⚠️ عذراً، هذه المحادثة مغلقة ولا يمكن إرسال رسائل لها."
        });
        return;
      }

      if (!chatSessions.has(clientId)) {
        chatSessions.set(clientId, []);
      }

      let adminImageUrl = null;

      if (message.photo && message.photo.length > 0) {
        const photoFileId = message.photo[message.photo.length - 1].file_id;
        try {
          const fileRes = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${photoFileId}`);
          const filePath = fileRes.data.result.file_path;
          adminImageUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
        } catch (imgErr) {
          console.error("❌ خطأ في جلب صورة رد الآدمن:", imgErr.message);
        }
      }

      const adminMsgObj = {
        sender: "admin",
        text: replyText,
        image: adminImageUrl,
        timestamp: new Date()
      };

      chatSessions.get(clientId).push(adminMsgObj);

      // بث رد الآدمن وإلغاء حالة الكتابة عبر Socket.io
      if (global.ioInstance) {
        global.ioInstance.to(clientId).emit("admin_typing", { typing: false });
        global.ioInstance.to(clientId).emit("new_message", adminMsgObj);
      }

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: message.chat.id,
        reply_to_message_id: message.message_id,
        text: "✅ تم إرسال الرد إلى العميل بنجاح."
      });
    }
  } catch (err) {
    console.error("❌ خطأ في معالجة رد المحادثة:", err.message);
  }
}

function getStoredMessages(clientId) {
  return chatSessions.get(clientId) || [];
}

module.exports = {
  initSocket,
  handleClientMessage,
  sendSupportChatMessage,
  handleTelegramReply,
  getStoredMessages
};
