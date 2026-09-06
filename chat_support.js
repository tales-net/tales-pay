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
      if (clientId) socket.join(clientId);
    });
  });
  global.ioInstance = io;
}

// معالجة رسالة العميل وإرسالها لتليجرام مع أزرار تفاعلية
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

// دالة إرسال الرسالة إلى تليجرام مع الأزرار التفاعلية (Inline Keyboards)
async function sendSupportChatMessage(clientId, messageText, imageBuffer = null) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) return null;

    const headerText = `💬 <b>رسالة دعم جديدة من العميل</b>\n` +
                       `🆔 معرف العميل: <code>${clientId}</code>\n` +
                       `----------------------------------------\n`;

    const replyMarkup = {
      inline_keyboard: [
        [
          { text: "✍️ للرد (اكتب /reply وإليك المعرف)", callback_data: `info_${clientId}` },
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
      form.append("caption", headerText + (messageText ? `📝 النص: ${messageText}` : ""));
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

// معالجة ردود الآدمن من تليجرام (سواء عبر الضغط على أزرار Callback أو الرد النصي Reply)
async function handleTelegramReply(body) {
  try {
    // 1. التعامل مع ضغط الأزرار (Callback Query) مثل زر إغلاق الشات
    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const data = callbackQuery.data;
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;

      if (data.startsWith("close_")) {
        const clientId = data.replace("close_", "");
        chatStatuses.set(clientId, "closed");

        // إشعار العميل عبر Socket.io فوراً بالقفل
        if (global.ioInstance) {
          global.ioInstance.to(clientId).emit("chat_closed", { message: "تم إغلاق المحادثة من قبل الدعم الفني." });
        }

        // تحديث رسالة تليجرام لتأكيد الإغلاق
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

    // 2. التعامل مع ردود الآدمن النصية (سواء بالرد مباشرة على الرسالة Reply أو بكتابة المعرف)
    const message = body.message;
    if (!message || !message.text) return;

    let clientId = null;
    let replyText = message.text;

    // إذا كان الآدمن قام بعمل Reply على رسالة سابقة في التليجرام
    if (message.reply_to_message) {
      const repliedMsgId = String(message.reply_to_message.message_id);
      clientId = telegramToClientMap.get(repliedMsgId);
    }

    // طريقة بديلة: إذا بدأ النص بـ /reply [clientId] [النص]
    if (!clientId && replyText.startsWith("/reply")) {
      const parts = replyText.split(" ");
      if (parts.length >= 3) {
        clientId = parts[1];
        replyText = parts.slice(2).join(" ");
      }
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

      const adminMsgObj = {
        sender: "admin",
        text: replyText,
        timestamp: new Date()
      };

      chatSessions.get(clientId).push(adminMsgObj);

      // بث رد الآدمن إلى متصفح العميل فوراً عبر Socket.io
      if (global.ioInstance) {
        global.ioInstance.to(clientId).emit("new_message", adminMsgObj);
      }

      // تأكيد الوصول للآدمن بتفاعل بسيط
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: message.chat.id,
        reply_to_message_id: message.message_id,
        text: "✅ تم إرسال الرد إلى العميل بنجاح."
      });
    }
  } catch (err) {
    console.error("❌ خطأ في معالجة رد تليجرام:", err.message);
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
