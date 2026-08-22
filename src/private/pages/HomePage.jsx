import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";
import {
  Search,
  X,
  Plus,
  MoreVertical,
  Users,
  Settings,
  Download,
  Upload,
  Lock,
  MessageCircle,
  Paperclip,
  Smile,
  Send,
  ArrowLeft,
  Clock,
  Check,
  CheckCheck,
  AlertCircle,
  RefreshCw,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { generateId } from "@/lib/utils";
import { API_BASE_PUBLIC, API_BASE, WS_URL } from "../constant/config.js";
import {
  initDatabase,
  generateChatId,
  createOrGetChat,
  getChats,
  clearUnread,
  saveMessage,
  getMessagesByChatId,
  updateMessageStatus,
  markMessagesAsRead,
  saveUser,
  getUserByPhone,
  exportDatabaseFile,
  importDatabaseFile,
} from "@/database";

// Matches AckDTO.SENT/DELIVERED/READ on the backend (plain ints, not
// strings - see com.example.chatapp.DTO.publicChat.AckDTO).
const ACK_STATUS = { 1: "SENT", 2: "DELIVERED", 3: "READ" };
const TYPING_STOP_DELAY = 2000;
const PAGE_SIZE = 50;
const ONLINE_POLL_MS = 5000;

/* ============================================================
   TIME FORMATTING
============================================================ */

function formatMessageTime(ts) {
  if (!ts) return "";
  return new Date(Number(ts)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatChatTime(ts) {
  if (!ts) return "";
  const date = new Date(Number(ts));
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const daysAgo = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (daysAgo < 7) return date.toLocaleDateString([], { weekday: "long" });
  return date.toLocaleDateString();
}

function truncateText(text, max = 32) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

/* ============================================================
   AVATAR COLOR - deterministic gradient per name/phone, so the
   same contact always gets the same color instead of flat gray.
============================================================ */

const AVATAR_GRADIENTS = [
  "from-emerald-400 to-teal-500",
  "from-sky-400 to-blue-500",
  "from-violet-400 to-purple-500",
  "from-rose-400 to-pink-500",
  "from-amber-400 to-orange-500",
  "from-fuchsia-400 to-pink-500",
  "from-cyan-400 to-sky-500",
  "from-lime-400 to-emerald-500",
];

function avatarGradient(seed = "") {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function InitialAvatar({ name, size = "h-10 w-10", textSize = "text-sm" }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  return (
    <Avatar className={`${size} bg-gradient-to-br ${avatarGradient(name)} shadow-sm ring-1 ring-black/5`}>
      <span className={`${textSize} font-semibold text-white`}>{initial}</span>
    </Avatar>
  );
}

/* ============================================================
   NEW CHAT (search an existing user by phone via the EXISTING
   backend lookup - GET /private/get/{phone}, same endpoint
   PrivateChat.jsx already uses for its "add member" flow)
============================================================ */

function NewChatModal({ myPhone, onOpenChat, onClose }) {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setError("");
    const target = phone.trim();
    if (!target) return setError("Enter a phone number");
    if (target === myPhone) return setError("You cannot start a chat with yourself");

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_PUBLIC}/get/${target}`);
      if (!res.ok) return setError("User not found");
      const user = await res.json();
      if (!user?.phone) return setError("User not found");
      onOpenChat(user);
    } catch (err) {
      console.error("New chat error:", err);
      setError(err?.message || "Server error - try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 animate-fade-in-up">
      <div className="bg-white p-5 rounded-2xl shadow-2xl w-[90vw] max-w-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-9 w-9 rounded-full bg-[#00a884]/10 flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-[#00a884]" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800">Start a new chat</h2>
        </div>
        <div className="relative">
          <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Phone number"
            className="pl-9"
          />
        </div>
        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <Button className="flex-1 bg-[#00a884] hover:bg-[#008f72]" onClick={handleSearch} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CHAT BACKUP - downloads/restores the complete local SQLite
   database (backupService.js), not a JSON-only export.
============================================================ */

function ChatBackupModal({ onClose, onRestored }) {
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleBackup = async () => {
    setError("");
    setMessage("");
    try {
      setBusy(true);
      await exportDatabaseFile();
      setMessage("Backup downloaded.");
    } catch (err) {
      setError(err.message || "Backup failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    if (!window.confirm(`Restore chat history from "${file.name}"? This replaces your current local chat data.`)) {
      return;
    }

    setError("");
    setMessage("");
    try {
      setBusy(true);
      // importDatabaseFile validates the backup's schema BEFORE touching
      // the live database - a bad file throws here and nothing is lost.
      await importDatabaseFile(file);
      setMessage("Restored successfully.");
      onRestored();
    } catch (err) {
      setError(err.message || "Restore failed - your existing chat data is untouched.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50 animate-fade-in-up">
      <div className="bg-white p-5 rounded-2xl shadow-2xl w-[90vw] max-w-sm">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-9 w-9 rounded-full bg-[#00a884]/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-[#00a884]" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800">Chat backup</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4 ml-11">
          Your complete local chat history, as a downloadable database file.
        </p>

        {message && <p className="text-green-600 text-sm mb-2">{message}</p>}
        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

        <Button className="w-full mb-2 bg-[#00a884] hover:bg-[#008f72] gap-2" onClick={handleBackup} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Backup chat data
        </Button>
        <Button className="w-full mb-2 gap-2" variant="outline" onClick={handleRestoreClick} disabled={busy}>
          <Upload className="h-4 w-4" />
          Restore chat data
        </Button>
        <input ref={fileInputRef} type="file" accept=".chatdb,.db" className="hidden" onChange={handleFileSelected} />

        <Button className="w-full mt-2" variant="destructive" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

/* ============================================================
   MESSAGE STATUS TICKS
============================================================ */

const MessageStatus = ({ status, onRetry }) => {
  if (status === "read") return <CheckCheck className="h-[15px] w-[15px] text-[#53bdeb] ml-1 shrink-0" />;
  if (status === "delivered") return <CheckCheck className="h-[15px] w-[15px] text-gray-400 ml-1 shrink-0" />;
  if (status === "sent") return <Check className="h-[15px] w-[15px] text-gray-400 ml-1 shrink-0" />;
  if (status === "sending") return <Clock className="h-[13px] w-[13px] text-gray-400 ml-1 shrink-0" />;
  if (status === "failed") {
    return (
      <button className="flex items-center gap-0.5 text-red-500 text-[11px] ml-1 hover:underline shrink-0" onClick={onRetry}>
        <AlertCircle className="h-3 w-3" />
        <RefreshCw className="h-3 w-3" />
      </button>
    );
  }
  return null;
};

export default function Home() {
  const myPhone = localStorage.getItem("phone") || "";
  const loggedUser = localStorage.getItem("name") || "Me";
  const loggedPhone = myPhone;

  const [dbReady, setDbReady] = useState(false);
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [searchText, setSearchText] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
  const [connected, setConnected] = useState(false);
  const [typingChats, setTypingChats] = useState({});
  const [onlineMap, setOnlineMap] = useState({});
  const [hasMoreHistory, setHasMoreHistory] = useState(false);

  const stompClient = useRef(null);
  const typingStopTimer = useRef(null);
  const wasTypingRef = useRef(false);
  const selectedChatRef = useRef(null); // avoids stale closures inside WS handlers
  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  /* ============================================================
     LOCAL DATABASE - loads/renders BEFORE any network call, so
     the chat list and history work even if the server is down.
  ============================================================ */

  useEffect(() => {
    initDatabase()
      .then(() => {
        setChats(getChats());
        setDbReady(true);
      })
      .catch((err) => {
        console.error("Local database failed to initialize:", err.message);
        setDbReady(true); // still render - just without persistence this session
      });
  }, []);

  const refreshChats = useCallback(() => setChats(getChats()), []);

  const loadMessagesForChat = useCallback((chatId, opts) => {
    const page = getMessagesByChatId(chatId, opts);
    setHasMoreHistory(page.length === PAGE_SIZE);
    return page;
  }, []);

  /* ============================================================
     DISPLAY-READY CHAT LIST (adds a top-level "phone" for the
     other participant so search/filter/avatars stay simple)
  ============================================================ */

  const chatsForDisplay = useMemo(
    () =>
      chats.map((c) => {
        const phone = c.members?.find((p) => p !== myPhone) || "";
        return {
          ...c,
          phone,
          name: c.name || phone,
          online: !!onlineMap[phone],
          typing: !!typingChats[c.chat_id],
        };
      }),
    [chats, myPhone, onlineMap, typingChats]
  );

  const filteredChats = useMemo(() => {
    const value = searchText.toLowerCase().trim();
    if (!value) return chatsForDisplay;
    return chatsForDisplay.filter(
      (chat) => chat.name.toLowerCase().includes(value) || chat.phone.includes(value)
    );
  }, [chatsForDisplay, searchText]);

  const selectedChatDisplay = useMemo(
    () => (selectedChat ? chatsForDisplay.find((c) => c.chat_id === selectedChat.chat_id) || selectedChat : null),
    [chatsForDisplay, selectedChat]
  );

  /* ============================================================
     ONLINE STATUS - periodic poll over every distinct contact
     currently in the chat list (same GET /private/isOnline/{phone}
     endpoint PrivateChat.jsx already uses).
  ============================================================ */

  useEffect(() => {
    const phones = [...new Set(chats.map((c) => c.members?.find((p) => p !== myPhone)).filter(Boolean))];
    if (phones.length === 0) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const entries = await Promise.all(
          phones.map(async (phone) => {
            const res = await fetch(`${API_BASE}/isOnline/${phone}`);
            return [phone, res.ok ? await res.json() : false];
          })
        );
        if (!cancelled) setOnlineMap(Object.fromEntries(entries));
      } catch {
        // Server unavailable - leave the last-known online state as-is
        // rather than flipping everyone to "offline" on a network blip.
      }
    };

    poll();
    const interval = setInterval(poll, ONLINE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chats, myPhone]);

  /* ============================================================
     SELECT CHAT
  ============================================================ */

  const handleSelectChat = (chat) => {
    setSelectedChat(chat);
    setMessages(loadMessagesForChat(chat.chat_id));
    clearUnread(chat.chat_id);
    refreshChats();
    setShowMenu(false);

    if (!connected) return;

    const readMessageIds = markMessagesAsRead(chat.chat_id, myPhone);
    if (readMessageIds.length === 0) return;

    const fresh = getMessagesByChatId(chat.chat_id, { limit: PAGE_SIZE });
    readMessageIds.forEach((messageId) => {
      const original = fresh.find((m) => m.message_id === messageId);
      stompClient.current?.publish({
        destination: "/app/chat.read",
        body: JSON.stringify({ messageId, sender: original?.sender_phone, reader: myPhone }),
      });
    });
    setMessages(fresh);
  };

  const loadOlderMessages = () => {
    if (!selectedChat || messages.length === 0) return;
    const older = loadMessagesForChat(selectedChat.chat_id, {
      limit: PAGE_SIZE,
      beforeTimestamp: messages[0].created_at,
    });
    setMessages((prev) => [...older, ...prev]);
  };

  /* ============================================================
     START A NEW CHAT (deterministic chat_id - see chatRepository.js)
  ============================================================ */

  const startChatWithUser = (user) => {
    saveUser({ phone: user.phone, name: user.name });
    const chatId = generateChatId(myPhone, user.phone);
    const chat = createOrGetChat({
      chatId,
      userPhone: myPhone,
      isGroup: false,
      name: user.name,
      members: [myPhone, user.phone],
    });
    refreshChats();
    setShowNewChat(false);
    handleSelectChat(chat);
  };

  /* ============================================================
     RECEIVE - idempotent: saveMessage() no-ops on a duplicate
     message_id, so a WebSocket redelivery can never duplicate it.
     Declared before the WebSocket effect below since it's referenced
     inside that effect's onConnect handler.
  ============================================================ */

  const handleIncomingMessage = useCallback((dto, stomp) => {
    const chatId = generateChatId(dto.sender, dto.receiver);
    const isOpen = selectedChatRef.current?.chat_id === chatId;

    if (!getUserByPhone(dto.sender)) {
      saveUser({ phone: dto.sender, name: dto.sender }); // placeholder, backfilled below
      fetch(`${API_BASE_PUBLIC}/get/${dto.sender}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((u) => u?.name && saveUser({ phone: dto.sender, name: u.name }))
        .catch(() => {});
    }

    createOrGetChat({
      chatId,
      userPhone: myPhone,
      isGroup: false,
      name: getUserByPhone(dto.sender)?.name || dto.sender,
      members: [myPhone, dto.sender],
    });

    const { inserted } = saveMessage(
      {
        messageId: dto.messageId,
        chatId,
        senderPhone: dto.sender,
        receiverPhone: dto.receiver,
        message: dto.payload,
        status: "DELIVERED", // it just arrived on this device - that IS "delivered" locally
        createdAt: dto.timeStamp,
        deliveredAt: Date.now(),
      },
      { bumpUnread: !isOpen }
    );

    if (inserted) {
      // Tells the server it's safe to purge its own copy now that a
      // durable local one exists - NOT a status broadcast (see
      // ChatService.acknowledgeDelivered).
      stomp.publish({ destination: "/app/messageDelivered", body: dto.messageId });
    }

    refreshChats();
    if (isOpen) {
      setMessages(loadMessagesForChat(chatId));
      stomp.publish({
        destination: "/app/chat.read",
        body: JSON.stringify({ messageId: dto.messageId, sender: dto.sender, reader: myPhone }),
      });
    }
  }, [myPhone, refreshChats, loadMessagesForChat]);

  /* ============================================================
     WEBSOCKET - same /ws endpoint + "user-id" CONNECT header
     PrivateChat.jsx already relies on (shared WebSocketConfig).
  ============================================================ */

  useEffect(() => {
    if (!myPhone) return;

    const stomp = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      connectHeaders: { "user-id": myPhone },
      reconnectDelay: 3000,
      onConnect: () => {
        setConnected(true);

        // Deliver anything queued for me while I was offline
        // (ChatService.deliverPendingMessages, keyed off the STOMP Principal).
        stomp.publish({ destination: "/app/chat.ready", body: "" });

        stomp.subscribe("/user/queue/receiveMessage", (frame) => {
          handleIncomingMessage(JSON.parse(frame.body), stomp);
        });

        stomp.subscribe("/user/queue/ack", (frame) => {
          const ack = JSON.parse(frame.body);
          const status = ACK_STATUS[ack.status];
          if (!status) return;

          updateMessageStatus(ack.messageId, status);
          const current = selectedChatRef.current;
          if (current) setMessages(loadMessagesForChat(current.chat_id));
          refreshChats();
        });

        stomp.subscribe("/user/queue/typing", (frame) => {
          const payload = JSON.parse(frame.body);
          const chatId = generateChatId(payload.sender, payload.receiver);
          setTypingChats((prev) => ({ ...prev, [chatId]: !!payload.typing }));
        });
      },
    });

    stomp.activate();
    stompClient.current = stomp;

    return () => stomp.deactivate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myPhone]);

  /* ============================================================
     TYPING
  ============================================================ */

  const publishTyping = useCallback(
    (isTyping) => {
      if (!selectedChat || !connected) return;
      const receiver = selectedChat.members?.find((p) => p !== myPhone);
      if (!receiver) return;
      stompClient.current.publish({
        destination: "/app/chat.typing",
        body: JSON.stringify({ sender: myPhone, receiver, typing: isTyping }),
      });
    },
    [selectedChat, connected, myPhone]
  );

  const handleMessageTextChange = (e) => {
    setMessageText(e.target.value);
    if (!wasTypingRef.current) {
      wasTypingRef.current = true;
      publishTyping(true);
    }
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      wasTypingRef.current = false;
      publishTyping(false);
    }, TYPING_STOP_DELAY);
  };

  /* ============================================================
     SEND - optimistic UI: insert as SENDING immediately, publish
     over the existing STOMP connection, /queue/ack moves it to SENT.
  ============================================================ */

  const sendMessage = () => {
    const text = messageText.trim();
    if (!text || !selectedChat) return;

    const receiver = selectedChat.members?.find((p) => p !== myPhone);
    if (!receiver) return;

    const messageId = generateId();
    const createdAt = Date.now();

    saveMessage({
      messageId,
      chatId: selectedChat.chat_id,
      senderPhone: myPhone,
      receiverPhone: receiver,
      message: text,
      status: "SENDING",
      createdAt,
    });

    setMessages(loadMessagesForChat(selectedChat.chat_id));
    refreshChats();
    setMessageText("");
    setShowEmoji(false);

    if (!connected) return; // stays SENDING in SQLite - nothing lost, retry-able later

    try {
      stompClient.current.publish({
        destination: "/app/chat.send",
        body: JSON.stringify({ messageId, sender: myPhone, receiver, payload: text, timeStamp: createdAt }),
      });
    } catch (err) {
      console.error("Failed to publish message:", err.message);
      updateMessageStatus(messageId, "FAILED");
      setMessages(loadMessagesForChat(selectedChat.chat_id));
    }

    if (wasTypingRef.current) {
      wasTypingRef.current = false;
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      publishTyping(false);
    }
  };

  const retryMessage = (msg) => {
    if (!connected || !selectedChat) return;
    updateMessageStatus(msg.message_id, "SENDING");
    setMessages(loadMessagesForChat(selectedChat.chat_id));
    stompClient.current.publish({
      destination: "/app/chat.send",
      body: JSON.stringify({
        messageId: msg.message_id,
        sender: msg.sender_phone,
        receiver: msg.receiver_phone,
        payload: msg.message,
        timeStamp: msg.created_at,
      }),
    });
  };

  const addEmoji = (emoji) => setMessageText((prev) => prev + emoji);

  const handlePrivateChat = () => (window.location.href = "/private-chat");

  const selectedMessages = messages;

  if (!dbReady) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-3 bg-[#d1d7db] text-gray-500 text-sm">
        <Loader2 className="h-6 w-6 animate-spin text-[#00a884]" />
        Loading your chats…
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-hidden bg-[#d1d7db]">
      <div className="flex h-full w-full">
        {/* =====================================================
            SIDEBAR
        ====================================================== */}
        <div
          className={`
            ${selectedChat ? "hidden md:flex" : "flex"}
            w-full
            md:w-[380px]
            lg:w-[420px]
            bg-white
            border-r
            border-gray-300
            flex-col
            shrink-0
          `}
        >
          {/* SIDEBAR HEADER */}
          <div className="h-[64px] bg-[#f0f2f5] flex items-center justify-between px-4 shrink-0 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <InitialAvatar name={loggedUser} />
              <div className="min-w-0">
                <div className="font-semibold text-[15px] text-gray-800 truncate">{loggedUser}</div>
                <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                  <span className="truncate">{loggedPhone || "Online"}</span>
                  <span className={`flex items-center gap-1 shrink-0 ${connected ? "text-green-500" : "text-gray-400"}`}>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-green-500" : "bg-gray-400 animate-soft-pulse"}`}
                    />
                    {connected ? "connected" : "connecting…"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                title="New chat"
                className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-gray-200 active:scale-95 transition text-gray-600"
                onClick={() => setShowNewChat(true)}
              >
                <Plus className="h-5 w-5" />
              </button>

              <div className="relative">
                <button
                  title="Menu"
                  onClick={() => setShowMenu((prev) => !prev)}
                  className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-gray-200 active:scale-95 transition text-gray-600"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>

                {showMenu && (
                  <div className="absolute right-0 top-11 w-52 bg-white shadow-xl rounded-xl py-2 z-50 border animate-fade-in-up overflow-hidden">
                    <button className="w-full flex items-center gap-3 text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                      <Users className="h-4 w-4 text-gray-500" />
                      New group
                    </button>
                    <button className="w-full flex items-center gap-3 text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                      <Settings className="h-4 w-4 text-gray-500" />
                      Settings
                    </button>
                    <button
                      onClick={() => {
                        setShowBackup(true);
                        setShowMenu(false);
                      }}
                      className="w-full flex items-center gap-3 text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <Download className="h-4 w-4 text-gray-500" />
                      Chat backup
                    </button>
                    <div className="my-1 border-t" />
                    <button
                      onClick={handlePrivateChat}
                      className="w-full flex items-center gap-3 text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <Lock className="h-4 w-4 text-gray-500" />
                      Private chat
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SEARCH */}
          <div className="bg-white px-3 py-2 border-b">
            <div className="relative">
              <Search className="h-4 w-4 text-gray-500 absolute left-4 top-1/2 -translate-y-1/2" />
              <Input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search or start new chat"
                className="h-9 pl-10 pr-10 bg-[#f0f2f5] border-none rounded-full focus-visible:ring-1 focus-visible:ring-[#00a884] text-sm"
              />
              {searchText && (
                <button
                  onClick={() => setSearchText("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* PUBLIC CHAT SHORTCUT - returns to the "no chat open" screen */}
          <div
            onClick={() => {
              setSelectedChat(null);
              setShowMenu(false);
            }}
            className="px-4 py-3 border-b cursor-pointer hover:bg-[#f5f6f6] transition-colors flex items-center gap-3"
          >
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#00a884] to-[#00c896] flex items-center justify-center text-white shadow-sm">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm text-gray-800">Public Chat</div>
              <div className="text-xs text-gray-500">Persistent chat</div>
            </div>
          </div>

          <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase bg-[#f0f2f5] tracking-wide">Chats</div>

          {/* CHAT LIST */}
          <ScrollArea className="flex-1 min-h-0">
            {filteredChats.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm flex flex-col items-center gap-2">
                <MessageCircle className="h-8 w-8 text-gray-300" />
                {chats.length === 0 ? (
                  <span>No chats yet - tap <Plus className="inline h-3.5 w-3.5 -mt-0.5" /> to find someone by phone number.</span>
                ) : (
                  "No chats found"
                )}
              </div>
            ) : (
              filteredChats.map((chat) => (
                <div
                  key={chat.chat_id}
                  onClick={() => handleSelectChat(chat)}
                  className={`
                    h-[72px] px-3 flex items-center cursor-pointer border-b border-gray-100 transition-colors
                    ${selectedChat?.chat_id === chat.chat_id ? "bg-[#f0f2f5]" : "bg-white hover:bg-[#f5f6f6]"}
                  `}
                >
                  <div className="relative mr-3 shrink-0">
                    <InitialAvatar name={chat.name} size="h-12 w-12" textSize="text-lg" />
                    {chat.online && (
                      <span className="absolute bottom-0 right-0 h-3 w-3 bg-[#25d366] border-2 border-white rounded-full" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 h-full flex flex-col justify-center">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-[15px] text-gray-800 truncate">{chat.name}</div>
                      <div className={`text-[11px] shrink-0 ${chat.unread_count > 0 ? "text-[#00a884] font-medium" : "text-gray-500"}`}>
                        {formatChatTime(chat.last_message_time)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="text-[13px] text-gray-500 truncate pr-2" title={chat.last_message}>
                        {chat.typing ? (
                          <span className="text-[#00a884] font-medium">typing...</span>
                        ) : (
                          truncateText(chat.last_message)
                        )}
                      </div>
                      {chat.unread_count > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#25d366] text-white text-[11px] font-semibold flex items-center justify-center shadow-sm">
                          {chat.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </ScrollArea>
        </div>

        {/* =====================================================
            CHAT WINDOW
        ====================================================== */}
        <div className={`${selectedChat ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0 min-h-0 relative`}>
          {selectedChat ? (
            <>
              {/* CHAT HEADER */}
              <div className="h-[64px] bg-[#f0f2f5] border-b border-gray-300 flex items-center px-3 md:px-5 shrink-0 shadow-sm">
                <button
                  onClick={() => setSelectedChat(null)}
                  className="md:hidden mr-2 h-9 w-9 rounded-full hover:bg-gray-200 active:scale-95 transition flex items-center justify-center text-gray-600"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>

                <div className="relative shrink-0">
                  <InitialAvatar name={selectedChatDisplay?.name} />
                  {selectedChatDisplay?.online && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-[#25d366] border-2 border-[#f0f2f5]" />
                  )}
                </div>

                <div className="ml-3 min-w-0">
                  <div className="font-medium text-[15px] truncate text-gray-800">{selectedChatDisplay?.name}</div>
                  <div className="text-[12px] text-gray-500">
                    {selectedChatDisplay?.typing ? (
                      <span className="text-[#00a884] font-medium">typing...</span>
                    ) : selectedChatDisplay?.online ? (
                      "online"
                    ) : (
                      "last seen recently"
                    )}
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-1">
                  <button title="Search" className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-gray-200 active:scale-95 transition text-gray-600">
                    <Search className="h-[18px] w-[18px]" />
                  </button>
                  <button title="More" className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-gray-200 active:scale-95 transition text-gray-600">
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* CHAT BODY */}
              <div className="flex-1 min-h-0 relative overflow-hidden bg-[#efeae2]">
                <div
                  className="absolute inset-0 opacity-[0.035] pointer-events-none"
                  style={{ backgroundImage: "radial-gradient(#54656f 1px, transparent 1px)", backgroundSize: "20px 20px" }}
                />

                <ScrollArea className="relative h-full p-3 md:p-5">
                  <div className="flex justify-center mb-4">
                    <div className="flex items-center gap-1.5 bg-[#fff3c4] text-[#54656f] text-[11px] px-3 py-1.5 rounded-lg shadow-sm text-center max-w-[420px]">
                      <Lock className="h-3 w-3 shrink-0" />
                      Messages are stored on this device.
                    </div>
                  </div>

                  {hasMoreHistory && (
                    <div className="flex justify-center mb-4">
                      <button
                        className="bg-white/80 text-[#00a884] text-xs px-3 py-1.5 rounded-lg shadow-sm hover:bg-white transition-colors"
                        onClick={loadOlderMessages}
                      >
                        Load older messages
                      </button>
                    </div>
                  )}

                  {selectedMessages.length === 0 ? (
                    <div className="flex justify-center mt-10">
                      <div className="bg-white/80 rounded-lg px-4 py-2 text-sm text-gray-500 shadow-sm">
                        No messages yet. Say hello 👋
                      </div>
                    </div>
                  ) : (
                    selectedMessages.map((msg) => {
                      const isMine = msg.sender_phone === myPhone;
                      return (
                        <div key={msg.message_id} className={`flex mb-2 animate-fade-in-up ${isMine ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`
                              relative max-w-[85%] sm:max-w-[70%] md:max-w-[60%] px-2.5 pt-2 pb-1.5 shadow-sm
                              ${isMine ? "bg-[#d9fdd3] rounded-lg rounded-tr-none" : "bg-white rounded-lg rounded-tl-none"}
                            `}
                          >
                            <div className="text-[14px] leading-5 text-gray-800 whitespace-pre-wrap break-words pr-2">
                              {msg.message}
                            </div>

                            <div className="flex items-center justify-end gap-1 mt-1 ml-3">
                              <span className="text-[10px] text-gray-500">{formatMessageTime(msg.created_at)}</span>
                              {isMine && (
                                <MessageStatus status={msg.status.toLowerCase()} onRetry={() => retryMessage(msg)} />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </ScrollArea>
              </div>

              {/* EMOJI PICKER */}
              {showEmoji && (
                <div className="absolute bottom-[72px] left-3 w-[280px] bg-white rounded-xl shadow-2xl border p-3 z-30 animate-fade-in-up">
                  <div className="grid grid-cols-8 gap-2 text-xl">
                    {["😀","😂","🤣","😊","😍","🥰","😘","👍","👎","❤️","🔥","🎉","👏","🙏","😎","🤔","😢","😡","💯","🚀","✨","🎯"].map(
                      (emoji, index) => (
                        <button key={index} onClick={() => addEmoji(emoji)} className="hover:bg-gray-100 rounded-lg p-1 transition-colors active:scale-90">
                          {emoji}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* MESSAGE INPUT */}
              <div className="min-h-[62px] bg-[#f0f2f5] px-2 md:px-4 py-2 flex items-center gap-2 shrink-0">
                <button
                  title="Emoji"
                  onClick={() => setShowEmoji((prev) => !prev)}
                  className={`h-10 w-10 rounded-full flex items-center justify-center hover:bg-gray-200 active:scale-95 transition shrink-0 ${showEmoji ? "text-[#00a884]" : "text-gray-600"}`}
                >
                  <Smile className="h-5 w-5" />
                </button>

                <button title="Attach" className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-gray-200 active:scale-95 transition text-gray-600 shrink-0">
                  <Paperclip className="h-5 w-5" />
                </button>

                <Input
                  className="flex-1 h-10 bg-white border-none rounded-full px-4 text-sm focus-visible:ring-1 focus-visible:ring-[#00a884] min-w-0"
                  placeholder="Type a message"
                  value={messageText}
                  onChange={handleMessageTextChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                />

                <button
                  onClick={sendMessage}
                  disabled={!messageText.trim()}
                  title="Send"
                  className={`
                    h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition active:scale-95
                    ${messageText.trim() ? "bg-[#00a884] text-white hover:bg-[#008f72] shadow-sm" : "bg-gray-200 text-gray-400"}
                  `}
                >
                  <Send className="h-[18px] w-[18px]" />
                </button>
              </div>
            </>
          ) : (
            /* EMPTY DESKTOP SCREEN */
            <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5]">
              <div className="text-center max-w-[500px] px-6 animate-fade-in-up">
                <div className="mx-auto mb-5 h-20 w-20 rounded-full bg-gradient-to-br from-[#00a884] to-[#00c896] flex items-center justify-center text-white shadow-lg">
                  <MessageCircle className="h-9 w-9" />
                </div>
                <h1 className="text-2xl font-light text-gray-700 mb-2">Chat Web</h1>
                <p className="text-sm text-gray-500 leading-6">
                  Send and receive messages without keeping your phone online.
                </p>
                <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-gray-400">
                  <Lock className="h-3.5 w-3.5" />
                  Your messages are stored on this device.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewChat && <NewChatModal myPhone={myPhone} onOpenChat={startChatWithUser} onClose={() => setShowNewChat(false)} />}
      {showBackup && (
        <ChatBackupModal
          onClose={() => setShowBackup(false)}
          onRestored={() => {
            refreshChats();
            setSelectedChat(null);
          }}
        />
      )}
    </div>
  );
}
