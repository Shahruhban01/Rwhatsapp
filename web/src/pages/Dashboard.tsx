import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useChats, type Message } from "../context/ChatContext";
import { ref, onValue, set, remove, serverTimestamp } from "firebase/database";
import { rtdb } from "../services/firebase";
import axios from "axios";
import {
  LogOut, Search, Send, User, Check, CheckCheck, Smile, Paperclip,
  Phone, Video, MoreVertical, MessageSquarePlus, ArrowLeft, X, Settings, Users, CircleDot,
  Reply as ReplyIcon, Trash2, Edit2, Pin, Star, CornerDownRight, Volume2, FileText, Loader2
} from "lucide-react";
import SettingsModal from "../components/SettingsModal";
import CreateGroupModal from "../components/CreateGroupModal";
import GroupInfoModal from "../components/GroupInfoModal";
import StoriesPanel from "../components/StoriesPanel";

const API_URL = "http://localhost:5000/api";

interface UserRecord {
  userId: string;
  username: string;
  name: string;
  profilePhotoUrl: string | null;
  about: string;
}

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const {
    chats, activeChatId, activeChat, messages,
    selectChat, startChatWithUser, sendTextMessage, sendMediaMessage,
    editMessage, deleteMessage, reactToMessage, togglePinMessage,
    clearChatHistory, deleteChat
  } = useChats();

  const [inputText, setInputText] = useState("");

  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showStories, setShowStories] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);

  // Group Details & Info
  const [allUsers, setAllUsers] = useState<UserRecord[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [startingChat, setStartingChat] = useState<string | null>(null);

  // Chat options dropdown (Clear, Delete, Pin, Mute)
  const [showChatMenu, setShowChatMenu] = useState(false);

  // Mute / Pin active status tracking
  const [mutedChats, setMutedChats] = useState<Record<string, boolean>>({});
  const [pinnedChats, setPinnedChats] = useState<Record<string, boolean>>({});

  // Message operational states
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [activeMenuMsgId, setActiveMenuMsgId] = useState<string | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");

  // Media uploading state
  const [mediaUploading, setMediaUploading] = useState(false);

  // Sidebar search
  const [sidebarSearch, setSidebarSearch] = useState("");

  // Recipient presence
  const [recipientPresence, setRecipientPresence] = useState<{ state: string; lastSeen?: number } | null>(null);
  const [recipientTyping, setRecipientTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const searchDebounceRef = useRef<any>(null);
  const chatMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const recipientId = activeChat?.participantIds.find(id => id !== user?.userId) || null;

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Click outside chat menu closer
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target as Node)) {
        setShowChatMenu(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Own Presence Connection
  useEffect(() => {
    if (!user) return;
    const myPresenceRef = ref(rtdb, `presence/${user.userId}`);
    const myConnectionsRef = ref(rtdb, `activeConnections/${user.userId}/web-session`);
    set(myPresenceRef, { state: "online", lastActive: serverTimestamp(), platform: "web" });
    set(myConnectionsRef, { platform: "web", connectedAt: Date.now() });
    return () => { remove(myPresenceRef); remove(myConnectionsRef); };
  }, [user]);

  // Recipient status listeners
  useEffect(() => {
    if (!recipientId || !activeChatId) {
      setRecipientPresence(null); setRecipientTyping(false); return;
    }
    const presenceRef = ref(rtdb, `presence/${recipientId}`);
    const unsub1 = onValue(presenceRef, (snap) => setRecipientPresence(snap.val()));
    const typingRef = ref(rtdb, `typing/${activeChatId}/${recipientId}`);
    const unsub2 = onValue(typingRef, (snap) => setRecipientTyping(snap.val()?.isTyping || false));
    return () => { unsub1(); unsub2(); };
  }, [recipientId, activeChatId]);

  // Handle typing status
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (!user || !activeChatId) return;
    const myTypingRef = ref(rtdb, `typing/${activeChatId}/${user.userId}`);
    set(myTypingRef, { isTyping: true, startedAt: Date.now() });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => remove(myTypingRef), 2000);
  };

  // List users for new chat slide-over
  const fetchUsers = useCallback(async (q = "") => {
    if (!user) return;
    setUsersLoading(true);
    try {
      const res = await axios.get(`${API_URL}/users`, { params: q ? { search: q } : {} });
      setAllUsers(res.data);
    } catch { /* ignore */ }
    finally { setUsersLoading(false); }
  }, [user]);

  useEffect(() => {
    if (!showNewChat) { setUserSearch(""); setAllUsers([]); return; }
    fetchUsers();
  }, [showNewChat]);

  // Debounce search
  useEffect(() => {
    if (!showNewChat) return;
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => fetchUsers(userSearch), 300);
    return () => clearTimeout(searchDebounceRef.current);
  }, [userSearch, showNewChat]);

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChatId || !user) return;
    const content = inputText.trim();
    setInputText("");

    const myTypingRef = ref(rtdb, `typing/${activeChatId}/${user.userId}`);
    remove(myTypingRef);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // Pass replyTo block if exists
    const replyPayload = replyToMessage ? {
      messageId: replyToMessage.messageId,
      senderId: replyToMessage.senderId,
      content: replyToMessage.content,
      type: replyToMessage.type
    } : null;

    setReplyToMessage(null);
    await sendTextMessage(content, replyPayload);
  };

  // Handle file uploads from file picker
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChatId) return;

    const formData = new FormData();
    formData.append("file", file);

    setMediaUploading(true);
    try {
      const res = await axios.post(`${API_URL}/storage/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      const { url, fileName, fileSize, mimeType } = res.data;

      // Resolve message media type
      let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
      if (mimeType.startsWith('image/')) mediaType = 'image';
      else if (mimeType.startsWith('video/')) mediaType = 'video';
      else if (mimeType.startsWith('audio/')) mediaType = 'audio';

      await sendMediaMessage(mediaType, url, {
        mediaName: fileName,
        mediaSize: fileSize,
        content: `Shared a ${mediaType}`
      });
    } catch (err) {
      console.error("Failed to upload media:", err);
      alert("Failed to upload media file.");
    } finally {
      setMediaUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Start chat with a user
  const handleStartChat = async (username: string) => {
    setStartingChat(username);
    try {
      await startChatWithUser(username);
      setShowNewChat(false);
    } catch { /* error handled in context */ }
    finally { setStartingChat(null); }
  };

  // Edit message submission
  const handleEditSubmit = async (messageId: string) => {
    if (!editInput.trim()) return;
    await editMessage(messageId, editInput.trim());
    setEditingMsgId(null);
    setEditInput("");
  };

  // Pinned message scroll utility
  const handleScrollToMessage = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Toggle Chat Pin status
  const handleTogglePinChat = (chatId: string) => {
    setPinnedChats(prev => ({ ...prev, [chatId]: !prev[chatId] }));
    setShowChatMenu(false);
  };

  // Toggle Chat Mute status
  const handleToggleMuteChat = (chatId: string) => {
    setMutedChats(prev => ({ ...prev, [chatId]: !prev[chatId] }));
    setShowChatMenu(false);
  };

  // Clear Chat History wrapper
  const handleClearHistory = async (chatId: string) => {
    if (window.confirm("Are you sure you want to clear chat history?")) {
      await clearChatHistory(chatId);
      setShowChatMenu(false);
    }
  };

  // Delete Chat entirely wrapper
  const handleDeleteChat = async (chatId: string) => {
    if (window.confirm("Are you sure you want to delete this chat?")) {
      await deleteChat(chatId);
      setShowChatMenu(false);
    }
  };

  // Helpers
  const formatTime = (ts: any) => {
    if (!ts) return "";
    let d: Date;
    if (ts.toDate) d = ts.toDate();
    else if (ts.seconds) d = new Date(ts.seconds * 1000);
    else d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getPresenceText = () => {
    if (recipientTyping) return "typing...";
    if (!recipientPresence || recipientPresence.state !== "online") {
      if (recipientPresence?.lastSeen) {
        return `last seen at ${new Date(recipientPresence.lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      }
      return "offline";
    }
    return "online";
  };

  const Avatar = ({ name, size = "md", photo }: { name: string; size?: "sm" | "md" | "lg"; photo?: string | null }) => {
    const sz = size === "sm" ? "w-8 h-8 text-sm" : size === "lg" ? "w-14 h-14 text-xl" : "w-10 h-10 text-base";
    if (photo) return <img src={photo} className={`${sz} rounded-full object-cover`} alt={name} />;
    return (
      <div className={`${sz} rounded-full bg-[#00a884] flex items-center justify-center font-bold text-white uppercase shrink-0`}>
        {name?.[0] || "U"}
      </div>
    );
  };

  // Sort chats (Pinned first, then lastMessageAt)
  const sortedChats = [...chats].sort((a, b) => {
    const aPinned = pinnedChats[a.chatId] ? 1 : 0;
    const bPinned = pinnedChats[b.chatId] ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;

    const timeA = a.lastMessageAt?.toMillis ? a.lastMessageAt.toMillis() : (a.lastMessageAt?.seconds ? a.lastMessageAt.seconds * 1000 : 0);
    const timeB = b.lastMessageAt?.toMillis ? b.lastMessageAt.toMillis() : (b.lastMessageAt?.seconds ? b.lastMessageAt.seconds * 1000 : 0);
    return timeB - timeA;
  });

  // Filtered sidebar chats
  const filteredChats = sidebarSearch.trim()
    ? sortedChats.filter(c =>
        c.metadata?.recipientName?.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
        c.metadata?.recipientUsername?.toLowerCase().includes(sidebarSearch.toLowerCase())
      )
    : sortedChats;

  const activePinnedMessages = messages.filter(m => m.isPinned && m.type !== 'deleted');

  return (
    <div className="flex h-screen w-screen bg-[#0b141a] text-[#efeae2] overflow-hidden select-none">

      {/* Hidden file input for media sharing */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
      />

      {/* ─── LEFT SIDEBAR ────────────────────────────────────────────────── */}
      <div className="w-[30%] min-w-[340px] max-w-[420px] border-r border-[#202c33] bg-[#111b21] flex flex-col h-full z-10">

        {/* Sidebar header */}
        <div className="h-[60px] bg-[#202c33] flex items-center justify-between px-4 py-2 border-b border-[#202c33]/50 shrink-0">
          <div className="flex items-center gap-3">
            <Avatar name={user?.name || "U"} photo={null} />
            <div className="flex flex-col">
              <span className="font-semibold text-sm leading-tight">{user?.name}</span>
              <span className="text-xs text-[#00a884] font-medium">@{user?.username}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowNewChat(true)}
              title="New chat"
              className="p-2 hover:bg-[#2a3942] rounded-full text-slate-400 hover:text-[#00a884] transition-colors duration-200"
            >
              <MessageSquarePlus className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowStories(true)}
              title="Status"
              className="p-2 hover:bg-[#2a3942] rounded-full text-slate-400 hover:text-[#00a884] transition-colors duration-200"
            >
              <CircleDot className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              title="Settings"
              className="p-2 hover:bg-[#2a3942] rounded-full text-slate-400 hover:text-[#00a884] transition-colors duration-200"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={logout}
              title="Log Out"
              className="p-2 hover:bg-[#2a3942] rounded-full text-slate-400 hover:text-white transition-colors duration-200"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sidebar search */}
        <div className="px-3 py-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              placeholder="Search or start new chat"
              className="w-full bg-[#202c33] rounded-lg pl-9 pr-4 py-2 text-xs text-[#efeae2] placeholder-[#8696a0] focus:outline-none"
            />
          </div>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto">
          {filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-slate-500 px-8">
              <User className="w-10 h-10 text-slate-600 mb-2" />
              <p className="font-semibold text-slate-400 text-sm">No chats yet</p>
              <p className="mt-1 text-[11px] text-slate-500">Click the <span className="text-[#00a884]">✎</span> icon above to start one</p>
            </div>
          ) : (
            filteredChats.map(chat => {
              const isSelected = chat.chatId === activeChatId;
              const hasUnread = chat.lastMessage && chat.lastMessage.senderId !== user?.userId && chat.lastMessage.status !== "read";
              const isMuted = mutedChats[chat.chatId];
              const isPinned = pinnedChats[chat.chatId];
              return (
                <div
                  key={chat.chatId}
                  onClick={() => { selectChat(chat.chatId); setShowNewChat(false); }}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-[#202c33]/30 transition ${isSelected ? "bg-[#2a3942]" : "hover:bg-[#202c33]/50"}`}
                >
                  <Avatar name={chat.metadata?.recipientName || "U"} photo={chat.metadata?.recipientPhotoUrl} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <h4 className="font-medium text-sm text-[#e9edef] truncate flex items-center gap-1.5">
                        {chat.metadata?.recipientName || "Direct Message"}
                        {isMuted && <Volume2 className="w-3.5 h-3.5 text-slate-500" />}
                        {isPinned && <Pin className="w-3.5 h-3.5 text-[#00a884] rotate-45 shrink-0" />}
                      </h4>
                      <span className={`text-[10px] shrink-0 ${hasUnread ? "text-[#00a884]" : "text-slate-400"}`}>
                        {formatTime(chat.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className={`text-xs truncate ${hasUnread ? "text-[#e9edef] font-semibold" : "text-[#8696a0]"}`}>
                        {chat.lastMessage ? chat.lastMessage.content : "No messages yet"}
                      </p>
                      {hasUnread && <span className="w-2 h-2 rounded-full bg-[#00a884] shrink-0 ml-2" />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ─── NEW CHAT PANEL (slide-over) ───────────────────────────────────── */}
      {showNewChat && (
        <div className="absolute left-0 top-0 w-[30%] min-w-[340px] max-w-[420px] h-full bg-[#111b21] z-20 flex flex-col shadow-2xl border-r border-[#202c33]">
          {/* Header */}
          <div className="h-[60px] bg-[#00a884] flex items-center gap-4 px-4 shrink-0">
            <button onClick={() => setShowNewChat(false)} className="text-white/80 hover:text-white transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-white font-semibold text-base">New Chat</h2>
          </div>

          {/* Search bar */}
          <div className="px-3 py-3 border-b border-[#202c33] shrink-0 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search by username..."
                autoFocus
                className="w-full bg-[#202c33] rounded-lg pl-9 pr-9 py-2 text-sm text-[#efeae2] placeholder-[#8696a0] focus:outline-none"
              />
              {userSearch && (
                <button onClick={() => setUserSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => { setShowCreateGroup(true); setShowNewChat(false); }}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[#202c33] rounded-lg transition text-[#00a884]"
            >
              <div className="w-8 h-8 rounded-full bg-[#00a884]/10 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold">New Group</span>
            </button>
          </div>

          {/* Users list */}
          <div className="flex-1 overflow-y-auto">
            {usersLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent border-[#00a884]" />
              </div>
            ) : allUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-500 text-xs">
                <User className="w-8 h-8 text-slate-600 mb-2" />
                {userSearch ? "No users found" : "No other users yet"}
              </div>
            ) : (
              <div>
                <p className="text-[10px] text-[#8696a0] uppercase tracking-widest px-4 py-2 font-semibold">
                  {allUsers.length} user{allUsers.length !== 1 ? "s" : ""} on this server
                </p>
                {allUsers.map(u => (
                  <button
                    key={u.userId}
                    onClick={() => handleStartChat(u.username)}
                    disabled={startingChat === u.username}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#202c33]/60 transition border-b border-[#202c33]/20 text-left"
                  >
                    <Avatar name={u.name} photo={u.profilePhotoUrl} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#e9edef] truncate">{u.name}</p>
                      <p className="text-xs text-[#8696a0] truncate">@{u.username}</p>
                    </div>
                    {startingChat === u.username && (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-t-transparent border-[#00a884] shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── RIGHT MAIN PANEL ──────────────────────────────────────────────── */}
      <div className="flex-1 bg-[#222e35] flex flex-col h-full relative">
        {!activeChat ? (
          /* Landing screen */
          <div className="flex-grow flex flex-col items-center justify-center">
            <div className="text-center p-8 max-w-[500px]">
              <div className="w-20 h-20 bg-[#00a884]/10 rounded-full flex items-center justify-center text-[#00a884] mx-auto mb-6">
                <svg viewBox="0 0 24 24" className="w-12 h-12" fill="currentColor">
                  <path d="M12.012 2C6.48 2 2 6.48 2 12.012c0 1.74.456 3.42 1.308 4.908L2 22l5.244-1.38c1.428.78 3.036 1.2 4.764 1.2 5.532 0 10-4.48 10-10.012C22 6.48 17.52 2 12.012 2zm.036 17.064c-1.548 0-3.072-.408-4.404-1.2l-.312-.192-3.264.864.876-3.18-.204-.324a7.005 7.005 0 01-1.08-3.768c0-3.876 3.156-7.032 7.032-7.032 3.876 0 7.032 3.156 7.032 7.032s-3.156 7.032-7.032 7.032z"/>
                </svg>
              </div>
              <h2 className="text-2xl font-light text-[#efeae2]">WhatsApp Web Clone</h2>
              <p className="text-[#8696a0] text-sm mt-3 leading-relaxed">
                Select a chat from the sidebar or click <strong className="text-[#00a884]">New Chat</strong> to start a conversation.
              </p>
              <button
                onClick={() => setShowNewChat(true)}
                className="mt-6 inline-flex items-center gap-2 bg-[#00a884] hover:bg-[#008f72] text-white text-sm font-semibold py-2.5 px-5 rounded-full transition"
              >
                <MessageSquarePlus className="w-4 h-4" /> New Chat
              </button>
            </div>
            <div className="absolute bottom-10 text-xs text-slate-600">
              Secure, Instant Peer-to-Peer Encrypted Scaffolding
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="h-[60px] bg-[#202c33] flex items-center justify-between px-4 border-b border-[#2e3b43]/30 shrink-0 relative">
              <div
                onClick={() => activeChat.type === 'group' && setShowGroupInfo(true)}
                className={`flex items-center gap-3 ${activeChat.type === 'group' ? 'cursor-pointer hover:opacity-80 transition' : ''}`}
              >
                <Avatar name={activeChat.metadata?.recipientName || "U"} photo={activeChat.metadata?.recipientPhotoUrl} />
                <div className="flex flex-col">
                  <span className="font-semibold text-sm leading-tight">{activeChat.metadata?.recipientName}</span>
                  <span className={`text-[10.5px] font-medium leading-none mt-0.5 transition-colors ${recipientTyping ? "text-[#00a884]" : "text-slate-400"}`}>
                    {activeChat.type === 'group' ? 'Tap for group info' : getPresenceText()}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-slate-300">
                <Video className="w-5 h-5 cursor-pointer hover:text-white" />
                <Phone className="w-4 h-4 cursor-pointer hover:text-white" />
                <div className="w-[1px] h-5 bg-[#2e3b43]" />
                <Search className="w-4 h-4 cursor-pointer hover:text-white" />
                
                {/* Header Options Dropdown */}
                <div className="relative" ref={chatMenuRef}>
                  <MoreVertical onClick={() => setShowChatMenu(!showChatMenu)} className="w-5 h-5 cursor-pointer hover:text-white" />
                  {showChatMenu && (
                    <div className="absolute right-0 top-8 bg-[#233138] border border-[#2e3b43] rounded-lg py-2 w-48 shadow-xl z-30 text-xs select-none">
                      <button
                        onClick={() => handleTogglePinChat(activeChat.chatId)}
                        className="w-full text-left px-4 py-2 hover:bg-[#182229] transition flex items-center gap-2"
                      >
                        <Pin className="w-3.5 h-3.5 text-slate-400 rotate-45" /> {pinnedChats[activeChat.chatId] ? "Unpin Chat" : "Pin Chat"}
                      </button>
                      <button
                        onClick={() => handleToggleMuteChat(activeChat.chatId)}
                        className="w-full text-left px-4 py-2 hover:bg-[#182229] transition flex items-center gap-2"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-slate-400" /> {mutedChats[activeChat.chatId] ? "Unmute Chat" : "Mute Notifications"}
                      </button>
                      <button
                        onClick={() => handleClearHistory(activeChat.chatId)}
                        className="w-full text-left px-4 py-2 hover:bg-[#182229] text-red-400 hover:text-red-300 transition flex items-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" /> Clear Chat History
                      </button>
                      <button
                        onClick={() => handleDeleteChat(activeChat.chatId)}
                        className="w-full text-left px-4 py-2 hover:bg-[#182229] text-red-400 hover:text-red-300 transition flex items-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-400" /> Delete Chat
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pinned Messages Bar (if any) */}
            {activePinnedMessages.length > 0 && (
              <div className="bg-[#182229] px-4 py-2 border-b border-[#2e3b43]/30 flex items-center justify-between text-xs text-[#00a884] shrink-0 font-medium z-10">
                <div className="flex items-center gap-2 cursor-pointer truncate" onClick={() => handleScrollToMessage(activePinnedMessages[0].messageId)}>
                  <Pin className="w-3.5 h-3.5 rotate-45 shrink-0" />
                  <span className="truncate">Pinned: "{activePinnedMessages[0].content}"</span>
                </div>
                <span className="text-[10px] text-slate-500 shrink-0 font-normal">
                  {activePinnedMessages.length} Pinned
                </span>
              </div>
            )}

            {/* Chat Screen Messages Container */}
            <div
              className="flex-1 overflow-y-auto p-4 md:p-6 space-y-1.5 flex flex-col"
              style={{ backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')", backgroundBlendMode: "overlay", backgroundColor: "#0b141a" }}
            >
              {messages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="bg-[#111b21]/80 border border-[#202c33] rounded-xl px-6 py-4 text-center max-w-[280px]">
                    <div className="text-2xl mb-2">👋</div>
                    <p className="text-sm font-semibold text-[#e9edef]">Say hello to {activeChat.metadata?.recipientName?.split(" ")[0]}</p>
                    <p className="text-[11px] text-[#8696a0] mt-1">This is the beginning of your conversation</p>
                  </div>
                </div>
              ) : (
                messages.map(msg => {
                  const isMe = msg.senderId === user?.userId;
                  const isDeleted = msg.type === 'deleted' || msg.isDeletedForEveryone;
                  const isMessageHovered = hoveredMessageId === msg.messageId;
                  const isEditing = editingMsgId === msg.messageId;

                  // Reaction badges
                  const reacts = msg.reactions || {};
                  const reactionEntries = Object.entries(reacts).filter(([_, list]) => list.length > 0);

                  return (
                    <div
                      key={msg.messageId}
                      id={`msg-${msg.messageId}`}
                      onMouseEnter={() => setHoveredMessageId(msg.messageId)}
                      onMouseLeave={() => { setHoveredMessageId(null); setActiveMenuMsgId(null); }}
                      className={`max-w-[65%] rounded-lg px-3 py-2 text-sm shadow-sm relative flex flex-col group min-w-[95px] ${
                        isMe ? "bg-[#005c4b] text-[#e9edef] self-end rounded-tr-none" : "bg-[#202c33] text-[#e9edef] self-start rounded-tl-none"
                      }`}
                    >
                      {/* Quoted Reply Render */}
                      {msg.replyTo && (
                        <div className="mb-1.5 p-2 bg-black/20 border-l-4 border-[#00a884] rounded text-xs select-none">
                          <p className="font-semibold text-[10px] text-[#00a884] flex items-center gap-1.5">
                            <CornerDownRight className="w-3 h-3" /> Reply
                          </p>
                          <p className="text-slate-300 truncate mt-0.5">{msg.replyTo.content}</p>
                        </div>
                      )}

                      {/* Message Content Render based on type */}
                      {isDeleted ? (
                        <p className="text-slate-400 italic text-[11px] pr-12 leading-relaxed">
                          This message was deleted
                        </p>
                      ) : isEditing ? (
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={editInput}
                            onChange={(e) => setEditInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleEditSubmit(msg.messageId)}
                            className="bg-black/30 border border-[#2e3b43] rounded px-2 py-1 text-xs text-white focus:outline-none w-full"
                          />
                          <button onClick={() => handleEditSubmit(msg.messageId)} className="text-[10px] bg-[#00a884] text-white py-1 px-2 rounded">Save</button>
                          <button onClick={() => setEditingMsgId(null)} className="text-[10px] hover:text-red-400">Cancel</button>
                        </div>
                      ) : (
                        <div className="mb-1">
                          {/* Image Message */}
                          {msg.type === 'image' && msg.mediaUrl && (
                            <img 
                              src={msg.mediaUrl} 
                              alt="Shared media" 
                              className="max-w-full max-h-60 rounded-lg object-cover cursor-pointer mb-1 border border-black/10"
                              onClick={() => window.open(msg.mediaUrl!, '_blank')}
                            />
                          )}

                          {/* Video Message */}
                          {msg.type === 'video' && msg.mediaUrl && (
                            <video 
                              src={msg.mediaUrl} 
                              controls 
                              className="max-w-full max-h-60 rounded-lg mb-1 border border-black/10"
                            />
                          )}

                          {/* Audio Message */}
                          {msg.type === 'audio' && msg.mediaUrl && (
                            <audio 
                              src={msg.mediaUrl} 
                              controls 
                              className="max-w-full mb-1 h-8 text-xs outline-none"
                            />
                          )}

                          {/* Document Message */}
                          {msg.type === 'document' && msg.mediaUrl && (
                            <div className="flex items-center gap-3 bg-black/20 p-3 rounded-lg border border-[#2e3b43] mb-1 select-none">
                              <div className="p-2.5 bg-[#00a884]/15 rounded-lg text-[#00a884] shrink-0">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate text-[#e9edef]">{msg.mediaName || "Document"}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {msg.mediaSize ? `${(msg.mediaSize / (1024 * 1024)).toFixed(2)} MB` : "Unknown size"}
                                </p>
                              </div>
                              <a 
                                href={msg.mediaUrl} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-xs text-[#00a884] font-semibold hover:underline"
                              >
                                Download
                              </a>
                            </div>
                          )}

                          {/* Render text caption or message content */}
                          {msg.content && msg.type !== 'image' && msg.type !== 'video' && msg.type !== 'audio' && msg.type !== 'document' && (
                            <p className="pr-12 break-words leading-relaxed">
                              {msg.content}
                              {msg.isEdited && <span className="text-[9px] text-slate-400 ml-1.5 font-normal select-none">(edited)</span>}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Emojis Reaction Badges list */}
                      {reactionEntries.length > 0 && (
                        <div className="flex gap-1 mt-1 bg-black/20 rounded-full py-0.5 px-1.5 self-start select-none">
                          {reactionEntries.map(([emoji, list]) => (
                            <span key={emoji} className="text-xs" title={`${list.length} reaction(s)`}>
                              {emoji}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Message Option Indicators */}
                      <div className="absolute right-2 bottom-1 flex items-center gap-1 text-[9px] text-[#8696a0] select-none">
                        <span>{formatTime(msg.sentAt)}</span>
                        {isMe && !isDeleted && (
                          <span>
                            {msg.status === "read" ? (
                              <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                            ) : msg.status === "delivered" ? (
                              <CheckCheck className="w-3.5 h-3.5 text-[#8696a0]" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-[#8696a0]" />
                            )}
                          </span>
                        )}
                        {msg.isPinned && <Pin className="w-3 h-3 rotate-45 text-[#00a884] ml-0.5" />}
                      </div>

                      {/* Hover dropdown list trigger */}
                      {isMessageHovered && !isDeleted && !isEditing && (
                        <div className="absolute -top-3.5 right-2 z-20 flex items-center bg-[#233138] border border-[#2e3b43] rounded-full p-1 shadow-lg text-slate-400 gap-1.5 select-none animate-in fade-in zoom-in-95 duration-100">
                          {/* Quick Reactions bar */}
                          {["👍", "❤️", "😂", "😮", "😢", "🙏"].map(emoji => (
                            <button
                              key={emoji}
                              onClick={() => reactToMessage(msg.messageId, emoji)}
                              className="hover:scale-125 transition text-xs"
                            >
                              {emoji}
                            </button>
                          ))}
                          
                          <div className="w-[1px] h-3 bg-[#2e3b43]" />

                          <button onClick={() => setReplyToMessage(msg)} title="Reply" className="hover:text-white p-0.5"><ReplyIcon className="w-3 h-3" /></button>
                          {isMe && msg.type === 'text' && <button onClick={() => { setEditingMsgId(msg.messageId); setEditInput(msg.content); }} title="Edit" className="hover:text-white p-0.5"><Edit2 className="w-3 h-3" /></button>}
                          <button onClick={() => togglePinMessage(msg.messageId)} title="Pin" className="hover:text-white p-0.5"><Pin className="w-3 h-3 rotate-45" /></button>
                          
                          {/* Delete Options Menu */}
                          <div className="relative">
                            <button onClick={() => setActiveMenuMsgId(activeMenuMsgId === msg.messageId ? null : msg.messageId)} title="Delete" className="hover:text-red-400 p-0.5">
                              <Trash2 className="w-3 h-3" />
                            </button>
                            {activeMenuMsgId === msg.messageId && (
                              <div className="absolute right-0 bottom-6 bg-[#233138] border border-[#2e3b43] rounded-lg py-1.5 w-36 shadow-xl text-[10px] z-30 font-semibold">
                                <button onClick={() => deleteMessage(msg.messageId, 'me')} className="w-full text-left px-3 py-1 hover:bg-[#182229] transition">Delete for Me</button>
                                {isMe && <button onClick={() => deleteMessage(msg.messageId, 'everyone')} className="w-full text-left px-3 py-1 hover:bg-[#182229] text-red-400 hover:text-red-300 transition">Delete for Everyone</button>}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quoted Message preview bar */}
            {replyToMessage && (
              <div className="bg-[#182229] px-4 py-2 border-t border-[#2e3b43]/30 flex items-center justify-between text-xs text-slate-300 shrink-0 font-medium z-10 select-none">
                <div className="flex items-center gap-2 truncate">
                  <CornerDownRight className="w-3.5 h-3.5 text-[#00a884] shrink-0" />
                  <span className="truncate">Replying to: "{replyToMessage.content}"</span>
                </div>
                <button onClick={() => setReplyToMessage(null)} className="p-1 hover:bg-slate-800 rounded-full">
                  <X className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            )}

            {/* Media Uploading Overlay */}
            {mediaUploading && (
              <div className="bg-[#182229] px-4 py-2.5 border-t border-[#2e3b43]/30 flex items-center gap-3 text-xs text-[#00a884] shrink-0 z-10 select-none font-semibold">
                <Loader2 className="w-4 h-4 animate-spin text-[#00a884]" />
                <span>Uploading attachment...</span>
              </div>
            )}

            {/* Input bar */}
            <div className="h-[62px] bg-[#202c33] flex items-center px-4 py-2 border-t border-[#2e3b43]/30 gap-3 shrink-0">
              <div className="flex gap-3 text-slate-400">
                <Smile className="w-6 h-6 cursor-pointer hover:text-white transition" />
                <Paperclip 
                  onClick={() => fileInputRef.current?.click()} 
                  className="w-5 h-5 cursor-pointer hover:text-white transition rotate-45" 
                />
              </div>
              <form onSubmit={handleSendMessage} className="flex-1 flex gap-3 items-center">
                <input
                  type="text"
                  value={inputText}
                  onChange={handleInputChange}
                  placeholder="Type a message"
                  className="flex-1 bg-[#2a3942] border border-transparent rounded-lg px-4 py-2 text-sm text-[#efeae2] placeholder-[#8696a0] focus:outline-none transition"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="bg-[#00a884] hover:bg-[#008f72] disabled:bg-transparent disabled:text-slate-400 text-white p-2.5 rounded-full transition flex items-center justify-center shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </>
        )}
      </div>
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <StoriesPanel isOpen={showStories} onClose={() => setShowStories(false)} />
      <CreateGroupModal
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        onCreated={(cid) => { selectChat(cid); setShowCreateGroup(false); }}
      />
      {activeChat && (
        <GroupInfoModal
          isOpen={showGroupInfo}
          onClose={() => setShowGroupInfo(false)}
          chatId={activeChat.chatId}
          groupName={activeChat.metadata?.recipientName || 'Group'}
          onLeftGroup={() => { selectChat(''); }}
        />
      )}
    </div>
  );
};

export default Dashboard;
