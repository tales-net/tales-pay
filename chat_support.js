const axios = require("axios");
const FormData = require("form-data");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const chatSessions = global.chatSessions || new Map();
global.chatSessions = chatSessions;

const chatStatuses = global.chatStatuses || new Map();
global.chatStatuses = chatStatuses;

const clientWaitTimes = global.clientWaitTimes || new Map();
global.clientWaitTimes = clientWaitTimes;

const telegramToClientMap = global.telegramToClientMap || new Map();
global.telegramToClientMap = telegramToClientMap;

function initSocket(io) {
  io.on("connection", (socket) => {
    socket.on("join_chat", (clientId) => {
      if (clientId) {
        socket.join(clientId);
        
        if (chatStatuses.get(clientId) === "closed") {
          chatStatuses.delete(clientId);
        }
      }
    });

    socket.on("queue_finished", async (data) => {
      const { clientId } = data;
      if (clientId && BOT_TOKEN && CHAT_ID) {
        try {
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: `🚨 <b>انتهى وقت الانتظار تماماً للعميل!</b>\n` +
                  `🆔 معرف العميل: <code>${clientId}</code>\n` +
                  `⏱️ وصل رقم الانتظار والعداد إلى <b>0</b> والعميل جاهز الآن للمحادثة الفورية.`,
            parse_mode: "HTML"
          });
        } catch (err) {
          console.error("Error sending queue finished telegram notice:", err.message);
        }
      }
    });
  });
  global.ioInstance = io;
}

async function handleClientMessage(res, sendSupportChatMessageFunc) {
  // تم ترك الدالة متوافقة مع البرامترات
}

// دالة لمعالجة الرسائل
async function handleClientMessageRoute(req, res, sendSupportChatMessageFunc) {
  try {
    const clientId = req.body.clientId || req.body.clientID;
    const messageText = req.body.message || "";
    const imageFile = req.file;

    if (!clientId) {
      return res.status(400).json({ success: false, message: "معرف العميل مفقود" });
    }

    if (chatStatuses.get(clientId) === "closed") {
      return res.status(403).json({ 
        success: false, 
        closed: true, 
        message: "تم إغلاق هذه المحادثة من قبل الدعم الفني." 
      });
    }

    const isFirstMessage = !chatSessions.has(clientId) || chatSessions.get(clientId).filter(m => m.sender === 'client').length === 0;

    if (!chatSessions.has(clientId)) {
      chatSessions.set(clientId, []);
    }

    let totalSeconds = 360; // افتراضي
    let initialQueue = 3;   // افتراضي

    if (isFirstMessage) {
      initialQueue = Math.floor(Math.random() * (10 - 3 + 1)) + 3;  
      totalSeconds = initialQueue * 60 + Math.floor(Math.random() * 120);

      clientWaitTimes.set(clientId, { totalSeconds, initialQueue });
      
      if (global.ioInstance) {
        global.ioInstance.to(clientId).emit("start_queue_countdown", { 
          totalSeconds: totalSeconds, 
          initialQueue: initialQueue 
        });
      }
    } else {
      const stored = clientWaitTimes.get(clientId) || { totalSeconds: 360, initialQueue: 3 };
      totalSeconds = stored.totalSeconds;
      initialQueue = stored.initialQueue;
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

    const waitMinutesApprox = Math.ceil(totalSeconds / 60);
    const telegramMsgId = await sendSupportChatMessageFunc(clientId, messageText, imageBuffer, waitMinutesApprox, isFirstMessage, initialQueue);
    if (telegramMsgId) {
      telegramToClientMap.set(String(telegramMsgId), clientId);
    }

    if (global.ioInstance) {
      global.ioInstance.to(clientId).emit("new_message", messageObj);
    }

    return res.json({ success: true, message: "تم إرسال الرسالة بنجاح" });
  } catch (err) {
    console.error("❌ خطأ في معالجة رسالة العميل:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function sendSupportChatMessage(clientId, messageText, imageBuffer = null, waitMinutes = 6, isFirst = false, queueNumber = 3) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) return null;

    const headerText = `💬 <b>${isFirst ? '⚠️ عميل جديد في طابور الانتظار الديناميكي' : 'رسالة جديدة من العميل'}</b>\n` +
                       `🆔 معرف العميل: <code>${clientId}</code>\n` +
                       (isFirst ? `📌 رقم الانتظار الابتدائي: <b># ${queueNumber}</b>\n⏳ الوقت التقديري المتغير: <b>~ ${waitMinutes} دقائق</b>\n` : ``) +
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
      form.append("caption", headerText + (messageText ? `📝 النص: ${messageText}` : "صورة مرسلة"));
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

async function handleTelegramReply(body) {
  try {
    // 1. معالجة ضغطات الأزرار (Callback Queries)
    if (body.callback_query) {
      const callbackQuery = body.callback_query;
      const data = callbackQuery.data;
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;
      const originalMessage = callbackQuery.message;

      // أزل علامة التحميل الدائرية من الزر في تليجرام فوراً
      try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          callback_query_id: callbackQuery.id
        });
      } catch (e) {
        // تجاهل خطأ انتهاء صلاحية الـ callback id إذا تكرر
      }

      if (data.startsWith("reply_")) {
        const clientId = data.replace("reply_", "");
        
        if (global.ioInstance) {
          global.ioInstance.to(clientId).emit("typing_status", { isTyping: true });
        }

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `👉 أكتب ردك الآن للعميل (معرف العميل: ${clientId}):\n(قم بالرد مباشرة على هذه الرسالة)`,
          reply_to_message_id: originalMessage.message_id,
          reply_markup: {
            force_reply: true,
            input_field_placeholder: `اكتب الرد للعميل ${clientId}...`
          }
        });
        return;
      }

      if (data.startsWith("close_")) {
        const clientId = data.replace("close_", "");
        chatStatuses.set(clientId, "closed");
        chatSessions.delete(clientId);
        clientWaitTimes.delete(clientId);

        if (global.ioInstance) {
          global.ioInstance.to(clientId).emit("chat_closed", { message: "تم إغلاق المحادثة من قبل الدعم الفني." });
        }

        // تحديث رسالة تليجرام لتصبح مغلقة
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [[{ text: "🔒 المحادثة مغلقة", callback_data: "closed" }]] }
        });

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `🔒 تم إغلاق المحادثة للعميل: ${clientId} بنجاح.`
        });
        return;
      }
      return;
    }

    // 2. معالجة الرسائل النصية الموجهة كـ رد من الآدمن
    const message = body.message;
    if (!message) return;

    let clientId = null;
    let replyText = message.text || message.caption || "";

    if (message.reply_to_message) {
      const repliedMsgId = String(message.reply_to_message.message_id);
      clientId = telegramToClientMap.get(repliedMsgId);

      // البحث الاحتياطي في النص أو الكابشن واستخراج الـ clientId بدقة
      const targetText = message.reply_to_message.text || message.reply_to_message.caption || "";
      if (!clientId && targetText) {
        const match = targetText.match(/معرف العميل:\s*([a-zA-Z0-9_-]+)/);
        if (match) {
          clientId = match[1];
        }
      }
      
      // فحص إضافي لو كان الرد على رسالة "أكتب ردك الآن" التي تحتوي على الـ clientId
      if (!clientId && targetText) {
        const matchAlt = targetText.match(/معرف العميل:\s*([a-zA-Z0-9_-]+)/);
        if (matchAlt) {
          clientId = matchAlt[1];
        }
      }
    }

    if (clientId) {
      if (chatStatuses.get(clientId) === "closed") {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: message.chat.id,
          text: "⚠️ عذراً، هذه المحادثة مغلقة من قبل ولا يمكن الرد عليها."
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
          const fileRes = await axios.get(`https://api.telegram.org/file/bot${BOT_TOKEN}/getFile?file_id=${photoFileId}`);
          adminImageUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileRes.data.result.file_path}`;
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

    if (global.ioInstance) {
        global.ioInstance.to(clientId).emit("typing_status", { isTyping: false });
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
  handleClientMessage: handleClientMessageRoute,
  sendSupportChatMessage,
  handleTelegramReply,
  getStoredMessages
};
