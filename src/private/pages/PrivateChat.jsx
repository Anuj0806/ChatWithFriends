// PrivateChat.jsx
import { useEffect, useState, useRef, useCallback } from "react";
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";
import CryptoJS from "crypto-js";

import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { generateId } from "@/lib/utils";
import "../styles/private.css";
import { API_BASE, WS_URL, SECRET_KEY, CHAT_TYPE_PUBLIC } from "../constant/config.js";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const TYPING_STOP_DELAY = 2000;

// -------------------------
function formatTime(ts) {
  if (!ts || isNaN(Number(ts))) return "";
  return new Date(Number(ts)).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function encrypt(payload) {
  return CryptoJS.AES.encrypt(
    JSON.stringify(payload),
    CryptoJS.enc.Utf8.parse(SECRET_KEY),
    { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
  ).toString();
}

// -------------------------
// Add Member Modal
// -------------------------
function AddMemberModal({ members = [], onAddMember, onClose }) {
  const [phone, setPhone] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    setErrorMsg("");
    if (!phone.trim()) return setErrorMsg("Enter phone number");
    if (phone === localStorage.getItem("phone"))
      return setErrorMsg("You cannot add yourself");

    try {
      setLoading(true);

      const enteredPhone = phone.trim();

      if (members.some((m) => m.phone === enteredPhone)) {
        return setErrorMsg("User already added");
      }

      const userRes = await fetch(`${API_BASE}/get/${enteredPhone}`);
      const user = await userRes.json();

      if (!user || !user.phone) {
        return setErrorMsg("User not found");
      }

      const onlineRes = await fetch(`${API_BASE}/isOnline/${user.phone}`);
      const online = await onlineRes.json();

      if (!online) {
        return setErrorMsg("Your friend is not in Private Chat.");
      }

      onAddMember({ phone: user.phone, name: user.name });
      setPhone("");
    } catch (err) {
      console.error(err);
      setErrorMsg("Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 dark:text-white p-5 rounded-xl w-[90vw] max-w-sm shadow-xl animate-pop-in">
        <h2 className="text-lg font-bold mb-3">Add Member</h2>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
        />
        {errorMsg && <p className="text-red-500">{errorMsg}</p>}
        <Button className="w-full mt-2" onClick={handleAdd} disabled={loading}>
          {loading ? "Checking..." : "Add Member"}
        </Button>

        {members.length > 0 && (
          <div className="mt-3">
            <h3 className="font-semibold">Members Added:</h3>
            {members.map((m) => (
              <div key={m.phone}>{m.name} ({m.phone})</div>
            ))}
          </div>
        )}

        <Button className="w-full mt-3" variant="destructive" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

// -------------------------
// Create Group Modal
// -------------------------
function CreateGroupModal({ myPhone, onCreateGroup, onClose }) {
  const [groupName, setGroupName] = useState("");
  const [members, setMembers] = useState([]);
  const [phone, setPhone] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const addMember = async () => {
    setErrorMsg("");
    if (!phone.trim()) return setErrorMsg("Enter phone number");
    if (phone === myPhone) return setErrorMsg("You cannot add yourself");

    try {
      if (members.find((m) => m.phone === phone)) return setErrorMsg("Already added");

      const userRes = await fetch(`${API_BASE}/get/${phone}`);
      const user = await userRes.json();

      if (!user || !user.phone) {
        return setErrorMsg("User not found");
      }

      const onlineRes = await fetch(`${API_BASE}/isOnline/${user.phone}`);
      const online = await onlineRes.json();

      if (!online) {
        return setErrorMsg("Your friend is not in Private Chat.");
      }

      setMembers([...members, { phone: user.phone, name: user.name }]);
      setPhone("");
    } catch {
      setErrorMsg("Server error");
    }
  };

  const removeMember = (phone) => setMembers(members.filter((m) => m.phone !== phone));

  const handleCreate = () => {
    if (!groupName.trim()) return setErrorMsg("Enter group name");
    if (members.length < 2) return setErrorMsg("Minimum 3 members required including you");

    const memberList = [myPhone, ...members.map((m) => m.phone)];
    onCreateGroup(groupName, memberList);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 p-5 rounded-xl w-[90vw] max-w-sm animate-pop-in">
        <h2 className="text-xl font-bold mb-3">Create Group</h2>

        <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button className="w-full mt-2" onClick={addMember}>
          ➕ Add Member
        </Button>

        {errorMsg && <p className="text-red-500 mt-1">{errorMsg}</p>}

        <div className="mt-2">
          <h3 className="font-semibold">Members:</h3>
          <div className="flex flex-col gap-1">
            <div className="bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">YOU ({myPhone})</div>

            {members.map((m) => (
              <div
                key={m.phone}
                className="flex justify-between bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded"
              >
                {m.name} ({m.phone})
                <button className="text-red-600" onClick={() => removeMember(m.phone)}>
                  ❌
                </button>
              </div>
            ))}
          </div>
        </div>

        <Input
          placeholder="Group Name"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          className="mt-2"
        />

        <Button className="w-full mt-3" onClick={handleCreate}>
          ✅ Create Group
        </Button>
        <Button className="w-full mt-2" variant="destructive" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

// -------------------------
// Typing indicator bubble
// -------------------------
function TypingBubble() {
  return (
    <div className="flex justify-start mb-3 animate-pop-in">
      <div className="typing-indicator">
        <span className="dot animate-typing-dot" style={{ animationDelay: "0ms" }} />
        <span className="dot animate-typing-dot" style={{ animationDelay: "150ms" }} />
        <span className="dot animate-typing-dot" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}

// -------------------------
// Reaction picker
// -------------------------
function ReactionPicker({ onPick, onClose, isMine }) {
  return (
    <div
      className={`absolute z-20 -top-11 bg-white dark:bg-gray-800 shadow-lg rounded-full pl-2 pr-1 py-1 flex items-center gap-1 animate-pop-in ${
        isMine ? "right-0" : "left-0"
      }`}
      onMouseLeave={onClose}
    >
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          className="hover:scale-125 active:scale-125 transition-transform text-lg p-0.5"
          onClick={() => onPick(emoji)}
        >
          {emoji}
        </button>
      ))}
      {/* onMouseLeave never fires on touch, so give mobile an explicit way
          to dismiss the picker without picking an emoji. */}
      <button
        className="md:hidden text-gray-400 text-sm px-1"
        onClick={onClose}
        aria-label="Close reaction picker"
      >
        ✕
      </button>
    </div>
  );
}

// -------------------------
// Main Component
// -------------------------
export default function PrivateChat() {
  const myPhone = localStorage.getItem("phone");
  const myName = localStorage.getItem("name");

  const [theme, setTheme] = useState("light");
  const [members, setMembers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [chatList, setChatList] = useState(() => {
    const saved = localStorage.getItem("chatList");
    return saved ? JSON.parse(saved) : [];
  });
  const [messagesByChat, setMessagesByChat] = useState(() => {
    const saved = localStorage.getItem("messagesByChat");
    return saved ? JSON.parse(saved) : {};
  });
  const [selectedChat, setSelectedChat] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [connected, setConnected] = useState(false);
  const [receiverOnline, setReceiverOnline] = useState(false);
  const [typingChats, setTypingChats] = useState({}); // { [chatId]: true }
  const [reactionPickerFor, setReactionPickerFor] = useState(null); // messageId

  const stompClient = useRef(null);
  const offlineTimeout = useRef(null);
  const typingStopTimer = useRef(null);
  const wasTypingRef = useRef(false);
  const readReceiptsSentRef = useRef(new Set());

  const initialized = useRef(true);

  const handleLogout = async () => {
    if (stompClient.current) {
      stompClient.current.deactivate();
    }
    window.location.href = "/home";
  };

  // const handleLogout = async () => {
  //   if (stompClient.current) {
  //     stompClient.current.deactivate();
  //   }

  //   // Private chat is designed to disappear once you leave it (that's the
  //   // whole point of it being "private" - nothing is ever persisted
  //   // server-side). Clear it - and the rest of the session - SYNCHRONOUSLY,
  //   // before navigating away. Deferring this with setTimeout(...) after
  //   // window.location.href is set is unsafe: a full navigation can unload
  //   // this page (killing this JS context) before a delayed timeout ever
  //   // fires, so the clear could silently never happen. Doing it first
  //   // guarantees it runs.
  //   localStorage.removeItem("chatList");
  //   localStorage.removeItem("messagesByChat");
  //   localStorage.removeItem("authToken");
  //   localStorage.removeItem("phone");
  //   localStorage.removeItem("name");

  //   // Logging out ends the session, not just this screen - send them to
  //   // login, not /home (which would otherwise render against a wiped
  //   // phone/name).
  //   window.location.href = "/";
  // };

  // ------------------------
  // DELETE CHAT FUNCTION
  // ------------------------
  const deleteChatNow = useCallback(() => {
    if (!selectedChat) return;

    const receiver = selectedChat.members.find((p) => p !== myPhone);

    setChatList((prev) => prev.filter((c) => c.id !== selectedChat.id));
    setMessagesByChat((prev) => {
      const updated = { ...prev };
      delete updated[selectedChat.id];
      return updated;
    });

    if (receiver) {
      setMembers((prev) => prev.filter((m) => m.phone !== receiver));
    }

    setSelectedChat(null);
  }, [selectedChat, myPhone]);

  // ------------------------
  // WATCH OFFLINE LOGIC
  // ------------------------
  useEffect(() => {
  console.log("OFFLINE EFFECT STARTED");
  console.log("selectedChat:", selectedChat);
  console.log("myPhone:", myPhone);

  if (!selectedChat || selectedChat.isGroup) {
    console.log("Effect stopped: no chat or group chat");
    return;
  }

  const receiver = selectedChat.members.find(
    (p) => p !== myPhone
  );

  console.log("Receiver:", receiver);

  if (!receiver) {
    console.log("Effect stopped: receiver not found");
    return;
  }

  let interval;

  const loadStatus = async () => {
    try {
      console.log("Checking online:", receiver);

      const res = await fetch(
        `${API_BASE}/isOnline/${receiver}`
      );

      const online = await res.json();

      console.log("ONLINE STATUS:", online);

      setReceiverOnline(online);

      if (online) {
        if (offlineTimeout.current) {
          clearTimeout(offlineTimeout.current);
          offlineTimeout.current = null;
        }

        return;
      }

      console.log("User is OFFLINE");

      if (offlineTimeout.current) {
        console.log("Offline timer already running");
        return;
      }

      console.log("Starting 60 second timer");

      offlineTimeout.current = setTimeout(() => {
        console.log("60 SECONDS COMPLETED");

        const userName =
          selectedChat?.name || "This user";

        window.alert(
          `${userName} has been offline for 60 seconds. So we deleted the chat.`
        );

        deleteChatNow();

        offlineTimeout.current = null;
      }, 6000);

    } catch (e) {
      console.error("Status check error:", e);
    }
  };

  interval = setInterval(loadStatus, 2000);

  loadStatus();

  return () => {
    console.log("Cleaning offline effect");

    clearInterval(interval);

    if (offlineTimeout.current) {
      clearTimeout(offlineTimeout.current);
      offlineTimeout.current = null;
    }
  };

}, [selectedChat, myPhone, deleteChatNow]);

  // -------------------------
  // Persist to localStorage (initial load happens via lazy useState above)
  // -------------------------
  useEffect(() => {
    if (!initialized.current) return;
    localStorage.setItem("chatList", JSON.stringify(chatList));
  }, [chatList]);

  useEffect(() => {
    if (!initialized.current) return;
    localStorage.setItem("messagesByChat", JSON.stringify(messagesByChat));
  }, [messagesByChat]);

  // -------------------------
  // Prevent leaving page
  // -------------------------
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = true;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // -------------------------
  // Receive message
  // -------------------------
  const receiveMessage = useCallback((msg) => {
    if (!msg.timestamp) msg.timestamp = Date.now();
    if (!msg.id) msg.id = generateId();
    const chatId = msg.chatId;

    setChatList((prev) => {
      const exists = prev.some((c) => c.id === chatId);

      if (exists) {
        return prev.map((c) => (c.id === chatId ? { ...c, last: msg.text } : c));
      }

      return [
        ...prev,
        {
          id: chatId,
          name: msg.isGroup ? msg.text : msg.senderName,
          members: msg.members,
          isGroup: msg.isGroup,
          last: msg.text,
        },
      ];
    });

    setMessagesByChat((prev) => ({
      ...prev,
      [chatId]: [...(prev[chatId] || []), msg],
    }));

    return msg;
  }, []);

  // -------------------------
  // WebSocket Connect
  // -------------------------
  useEffect(() => {
    const stomp = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      // Must be "user-id" - WebSocketConfig's CONNECT interceptor reads
      // this exact header to set the STOMP Principal, which is what marks
      // this user "online" for OnlineUserTracker (used by isOnline checks
      // in both private and public chat).
      connectHeaders: { "user-id": myPhone },
      reconnectDelay: 3000,
      onConnect: () => {
        setConnected(true);

        stomp.subscribe(`/topic/private.${myPhone}`, (msg) => {
          const parsed = JSON.parse(msg.body);
          receiveMessage(parsed);
        });

        stomp.subscribe(`/topic/group.${myPhone}`, (msg) => receiveMessage(JSON.parse(msg.body)));

        // typing indicator
        stomp.subscribe(`/topic/private.${myPhone}.typing`, (frame) => {
          const payload = JSON.parse(frame.body);
          setTypingChats((prev) => ({ ...prev, [payload.chatId]: !!payload.typing }));
        });

        // read receipts
        stomp.subscribe(`/topic/private.${myPhone}.read`, (frame) => {
          const payload = JSON.parse(frame.body);
          setMessagesByChat((prev) => {
            const chatMsgs = prev[payload.chatId];
            if (!chatMsgs) return prev;
            return {
              ...prev,
              [payload.chatId]: chatMsgs.map((m) =>
                m.id === payload.messageId ? { ...m, status: "read" } : m
              ),
            };
          });
        });

        // reactions
        stomp.subscribe(`/topic/private.${myPhone}.reaction`, (frame) => {
          const payload = JSON.parse(frame.body);
          setMessagesByChat((prev) => {
            const chatMsgs = prev[payload.chatId];
            if (!chatMsgs) return prev;
            return {
              ...prev,
              [payload.chatId]: chatMsgs.map((m) =>
                m.id === payload.messageId
                  ? { ...m, reactions: { ...(m.reactions || {}), [payload.sender]: payload.emoji } }
                  : m
              ),
            };
          });
        });
      },
    });

    stomp.activate();
    stompClient.current = stomp;

    return () => stomp.deactivate();
  }, [myPhone, receiveMessage]);

  // -------------------------
  // Send "read" receipts for the open chat's incoming messages
  // -------------------------
  useEffect(() => {
    if (!selectedChat || selectedChat.isGroup || !connected) return;

    const chatMsgs = messagesByChat[selectedChat.id] || [];
    const unread = chatMsgs.filter(
      (m) => m.sender !== myPhone && m.status !== "read" && !readReceiptsSentRef.current.has(m.id)
    );

    if (unread.length === 0) return;

    unread.forEach((m) => {
      readReceiptsSentRef.current.add(m.id);
      stompClient.current.publish({
        destination: "/app/private.read",
        body: JSON.stringify({
          chatId: selectedChat.id,
          messageId: m.id,
          sender: m.sender,
          reader: myPhone,
        }),
      });
    });
  }, [selectedChat, messagesByChat, connected, myPhone]);

  // -------------------------
  // Create private chat
  // -------------------------
      const addMemberToChat = (user) => {
        if (!members.find((m) => m.phone === user.phone)) {
          setMembers([...members, user]);
        }

        const chatId = generatePrivateChatId(myPhone, user.phone);

        // Prevent duplicate chat
        setChatList((prev) => {
          if (prev.some((chat) => chat.id === chatId)) {
            return prev;
          }

          return [
            ...prev,
            {
              id: chatId,
              name: user.name,
              members: [myPhone, user.phone],
              isGroup: false,
              last: "New chat started",
            },
          ];
        });
      };
//generrate the hash id to dont duplicate the user

  const generatePrivateChatId = (phone1, phone2) => {
      const sorted = [String(phone1), String(phone2)].sort();
      const value = sorted.join(":");

      let hash = 0;
      for (let i = 0; i < value.length; i++) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
      }

      return `chat_${Math.abs(hash)}`;
    };


  // -------------------------
  // Typing publish (debounced stop)
  // -------------------------
  const publishTyping = useCallback(
    (isTyping) => {
      if (!selectedChat || selectedChat.isGroup || !connected) return;
      const receiver = selectedChat.members.find((p) => p !== myPhone);
      if (!receiver) return;

      stompClient.current.publish({
        destination: "/app/private.typing",
        body: JSON.stringify({
          chatId: selectedChat.id,
          sender: myPhone,
          receiver,
          typing: isTyping,
        }),
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

  // -------------------------
  // Send message
  // -------------------------
  const sendMessage = () => {
    if (!messageText.trim() || !selectedChat || !connected) return;
    if (!receiverOnline && !selectedChat.isGroup) {
      window.alert("Your partner is not online right now.");
      return;
    }

    const membersList = selectedChat.isGroup
      ? selectedChat.members
      : [myPhone, selectedChat.members.find((p) => p !== myPhone)];

    const rawMsg = {
      id: generateId(),
      chatId: selectedChat.id,
      sender: myPhone,
      senderName: myName,
      text: messageText,
      timestamp: Date.now(),
      isGroup: selectedChat.isGroup,
      members: membersList,
      status: "sent",
    };

    stompClient.current.publish({
      destination: selectedChat.isGroup ? "/app/group" : "/app/private",
      body: encrypt(rawMsg),
    });

    receiveMessage(rawMsg);
    setMessageText("");

    if (wasTypingRef.current) {
      wasTypingRef.current = false;
      if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
      publishTyping(false);
    }
  };

  // -------------------------
  // Reactions
  // -------------------------
  const sendReaction = (message, emoji) => {
    if (!selectedChat || selectedChat.isGroup) return;
    const receiver = selectedChat.members.find((p) => p !== myPhone);

    setMessagesByChat((prev) => ({
      ...prev,
      [selectedChat.id]: (prev[selectedChat.id] || []).map((m) =>
        m.id === message.id
          ? { ...m, reactions: { ...(m.reactions || {}), [myPhone]: emoji } }
          : m
      ),
    }));

    stompClient.current.publish({
      destination: "/app/private.reaction",
      body: JSON.stringify({
        chatId: selectedChat.id,
        messageId: message.id,
        sender: myPhone,
        receiver,
        emoji,
      }),
    });

    setReactionPickerFor(null);
  };

  // -------------------------
  // Create Group
  // -------------------------
  const createGroup = (groupName, membersList) => {
    const chatId = generateId();

    const groupMsg = {
      id: generateId(),
      chatId,
      sender: myPhone,
      senderName: myName,
      text: groupName,
      timestamp: Date.now(),
      isGroup: true,
      members: membersList,
    };

    stompClient.current.publish({
      destination: "/app/group/create",
      body: encrypt(groupMsg),
    });
  };

  const isTypingInSelectedChat = selectedChat && typingChats[selectedChat.id];

  // -------------------------
  // UI
  // -------------------------
  return (
    <div className={theme === "dark" ? "dark h-screen" : "h-screen"}>
      <div className="flex h-full bg-gray-100 dark:bg-gray-900 dark:text-white overflow-hidden">

        {/* Sidebar - on mobile this IS the screen when no chat is open,
            and disappears entirely once one is (back button returns here).
            From md: up, both panels sit side by side permanently, same as
            desktop always worked. */}
        <div
          className={`${selectedChat ? "hidden" : "flex"} md:flex w-full md:w-1/3 bg-white dark:bg-gray-800 border-r dark:border-gray-700 flex-col`}
        >
          <div className="p-3 md:p-4 text-lg md:text-xl font-semibold border-b flex justify-between items-center gap-2">
            <span className="truncate">🔒 Private Chat</span>

            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
                {theme === "light" ? "🌙" : "☀️"}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>

          <div className="p-3 flex flex-wrap gap-2 md:gap-3">
            <Button size="sm" onClick={() => setShowAdd(true)}>➕ New Private</Button>
            <Button size="sm" onClick={() => setShowGroup(true)}>👥 Group</Button>
          </div>

          <ScrollArea className="flex-1">
            {chatList.map((chat) => (
              <div
                key={chat.id}
                onClick={() => setSelectedChat(chat)}
                className="flex items-center p-3 md:p-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 border-b transition-colors active:bg-gray-200 dark:active:bg-gray-600"
              >
                <Avatar className="mr-3 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{chat.name}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-300 truncate"  title={chat.last}>
                    {typingChats[chat.id] ? (
                      <span className="text-green-600">typing…</span>
                    ) : (
                      /* chat.last */
                       chat.last?.length > 30
                          ? chat.last.substring(0, 20) + " . . . . . . . "
                          : chat.last
                    )}
                  </div>
                </div>
              </div>
            ))}
          </ScrollArea>
        </div>

        {/* Chat Window - mobile: only rendered once a chat is selected;
            md+: always visible next to the sidebar. */}
        <div className={`${selectedChat ? "flex" : "hidden"} md:flex flex-1 flex-col min-w-0`}>
          {selectedChat ? (
            <>
              <div className="p-3 md:p-4 bg-white dark:bg-gray-800 border-b flex items-center gap-2 md:gap-3">
                <button
                  className="md:hidden -ml-1 mr-1 p-1 text-xl shrink-0"
                  onClick={() => setSelectedChat(null)}
                  aria-label="Back to chat list"
                >
                  ←
                </button>
                <Avatar className="shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold truncate">{selectedChat.name}</div>

                  {!selectedChat.isGroup && (
                    <div className="text-sm">
                      {isTypingInSelectedChat ? (
                        <span className="text-green-500">typing…</span>
                      ) : receiverOnline ? (
                        <span className="text-green-500">● Online</span>
                      ) : (
                        <span className="text-gray-400">● Offline</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <ScrollArea className="flex-1 p-4 bg-gray-50 dark:bg-gray-900">
                {(messagesByChat[selectedChat.id] || []).map((msg, i) => {
                  const isMine = msg.sender === myPhone;
                  const reactions = msg.reactions || {};
                  const reactionList = Object.values(reactions);

                  return (
                    <div
                      key={msg.id || msg.timestamp + "-" + i}
                      className={`relative mb-4 flex ${isMine ? "justify-end" : "justify-start"} group`}
                    >
                      <div
                        className={`relative px-4 py-2 rounded-2xl max-w-[78%] sm:max-w-xs shadow ${
                          isMine
                            ? "bg-green-200 dark:bg-green-800 text-black"
                            : "bg-white dark:bg-gray-700"
                        }`}
                        onDoubleClick={() => !msg.isGroup && setReactionPickerFor(msg.id)}
                      >
                        {reactionPickerFor === msg.id && (
                          <ReactionPicker
                            isMine={isMine}
                            onPick={(emoji) => sendReaction(msg, emoji)}
                            onClose={() => setReactionPickerFor(null)}
                          />
                        )}

                        <div className="text-xs text-red-600 dark:text-red mt-1">
                          {!msg.isGroup ? "" : isMine ? "" : msg.senderName}
                        </div>

                        <div className="text-black dark:text-white break-words">{msg.text}</div>

                        <div className="flex items-center justify-end gap-1 text-xs text-gray-500 dark:text-white mt-1">
                          {formatTime(msg.timestamp)}
                          {isMine && !msg.isGroup && (
                            <span className={msg.status === "read" ? "text-blue-500" : ""}>
                              {msg.status === "read" ? "✓✓" : "✓"}
                            </span>
                          )}
                        </div>

                        {reactionList.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {[...new Set(reactionList)].map((emoji) => (
                              <span key={emoji} className="reaction-pill animate-pop-in">
                                {emoji} {reactionList.filter((r) => r === emoji).length}
                              </span>
                            ))}
                          </div>
                        )}

                        {!msg.isGroup && (
                          <button
                            className={`opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity absolute top-1/2 -translate-y-1/2 text-sm ${
                              isMine ? "-left-7" : "-right-7"
                            }`}
                            title="React"
                            onClick={() => setReactionPickerFor(msg.id)}
                          >
                            🙂
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isTypingInSelectedChat && <TypingBubble />}
              </ScrollArea>

              <div className="p-2 md:p-4 bg-white dark:bg-gray-800 border-t flex gap-2">
                <Input
                  placeholder="Type a message"
                  value={messageText}
                  onChange={handleMessageTextChange}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                />
                <Button onClick={sendMessage} disabled={!connected}>
                  {connected ? "Send" : "Connecting..."}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-300">
              Select a chat to start messaging
            </div>
          )}
        </div>

        {/* Modals */}
        {showAdd && (
          <AddMemberModal
            members={members}
            onAddMember={addMemberToChat}
            onClose={() => setShowAdd(false)}
          />
        )}

        {showGroup && (
          <CreateGroupModal
            myPhone={myPhone}
            onCreateGroup={(groupName, membersList) => {
              createGroup(groupName, membersList);
              setShowGroup(false);
            }}
            onClose={() => setShowGroup(false)}
          />
        )}
      </div>
    </div>
  );
}