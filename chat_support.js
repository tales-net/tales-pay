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

// تخزين مؤقت لبيانات الأدمين الذين يضغطون على زر "أكتب الرد"
const adminReplyState = global.adminReplyState || new Map();
global.adminReplyState = adminReplyState;

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

// دالة لمعالجة الرسائل القادمة من العميل
async function handleClientMessage(req, res, sendSupportChatMessageFunc) {
  return handleClientMessageRoute(req, res, sendSupportChatMessageFunc);
}

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

    let totalSeconds = 360; 
    let initialQueue = 3;   

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

// دالة إرسال رسالة العميل إلى جروب التليجرام (مكتملة وصحيحة)
async function sendSupportChatMessage(clientId, messageText, imageBuffer = null, waitMinutes = 6, isFirst = false, queueNumber = 3) {
  try {
    if (!BOT_TOKEN || !CHAT_ID) return null;

    const headerText = `💬 <b>${isFirst ? '⚠️ عميل جديد في طابور الانتظار الديناميكي' : 'رسالة جديدة من العميل'}</b>\n` +
                       `🆔 معرف العميل: <code>${clientId}</code>\n` +
                       (isFirst ? `📌 رقم الانتظار الابتدائي: <b># ${queueNumber}</b>\n⏳ الوقت التقديري المتغير: <b>~ ${waitMinutes} دقائق</b>\n` : ``) +
                       `----------------------------------------\n` +
                       (messageText ? `الرسالة: ${messageText}` : `[مرفق صورة]`);

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
      form.append("caption", headerText);
      form.append("parse_mode", "HTML");
      form.append("reply_markup", JSON.stringify(replyMarkup));

      response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, form, {
        headers: form.getHeaders()
      });
    } else {
      response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: headerText,
        parse_mode: "HTML",
        reply_markup: replyMarkup
      });
    }

    if (response.data && response.data.result) {
      return response.data.result.message_id;
    }
    return null;
  } catch (err) {
    console.error("❌ خطأ في إرسال رسالة الدعم لتليجرام:", err.response?.data || err.message);
    return null;
  }
}

// معالجة ضغط الأزرار الخاصة بالشات (أكتب الرد / إغلاق الشات)
async function handleChatCallback(callbackQuery) {
  try {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const queryId = callbackQuery.id;
    const userId = callbackQuery.from.id;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      callback_query_id: queryId,
      text: "تم الطلب..."
    });

    if (data.startsWith("reply_")) {
      const clientId = data.replace("reply_", "");
      adminReplyState.set(userId, clientId);

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `✍️ **أدخل ردك الآن للعميل (معرف: ${clientId}):**\nاكتب رسالتك في الرد مباشرة وسيتم إرسالها فوراً للعميل.`
      });
    } else if (data.startsWith("close_")) {
      const clientId = data.replace("close_", "");
      chatStatuses.set(clientId, "closed");

      if (global.ioInstance) {
        global.ioInstance.to(clientId).emit("chat_closed", { message: "تم إغلاق المحادثة من قبل الدعم الفني." });
      }

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `🔒 تم إغلاق الشات للعميل (${clientId}) بنجاح.`
      });
    }
  } catch (err) {
    console.error("❌ خطأ في معالجة أزرار الشات:", err.message);
  }
}

// معالجة ردود الأدمن النصية من تليجرام وإرسالها للعميل
async function handleTelegramReply(update) {
  try {
    // 1. فحص هل هو ضغطة زر تخص الشات؟
    if (update.callback_query && (update.callback_query.data.startsWith("reply_") || update.callback_query.data.startsWith("close_"))) {
      await handleChatCallback(update.callback_query);
      return;
    }

    const message = update.message || update.edited_message;
    if (!message || !message.text) return;

    const adminId = message.from.id;
    const text = message.text;

    // التحقق هل الأدمن في وضع الرد على عميل معين
    if (adminReplyState.has(adminId)) {
      const clientId = adminReplyState.get(adminId);
      adminReplyState.delete(adminId); // إزالة الحالة بعد الرد

      const messageObj = {
        sender: "support",
        text: text,
        image: null,
        timestamp: new Date()
      };

      if (!chatSessions.has(clientId)) {
        chatSessions.set(clientId, []);
      }
      chatSessions.get(clientId).push(messageObj);

      if (global.ioInstance) {
        global.ioInstance.to(clientId).emit("new_message", messageObj);
      }

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: `✅ تم إرسال الرد إلى العميل (${clientId}) بنجاح.`
      });
    }
  } catch (err) {
    console.error("❌ خطأ في معالجة رد الأدمن في تليجرام:", err.message);
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
