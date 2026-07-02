import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from './AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export interface Chat {
  chatId: string;
  type: 'one_to_one' | 'group';
  participantIds: string[];
  lastMessage: {
    messageId: string;
    senderId: string;
    content: string;
    type: string;
    timestamp: any;
    status: 'sending' | 'sent' | 'delivered' | 'read';
  } | null;
  lastMessageAt: any;
  createdAt: any;
  createdBy: string;
  metadata?: {
    recipientName: string;
    recipientUsername: string;
    recipientPhotoUrl: string | null;
  };
  settings?: {
    isPinned: boolean;
    isArchived: boolean;
    isMuted: boolean;
    muteUntil: any;
    wallpaper: string | null;
    unreadCount: number;
    lastReadMessageId: string;
  };
}

export interface Message {
  messageId: string;
  chatId: string;
  senderId: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'voice_note' | 'document' | 'gif' | 'sticker' | 'deleted';
  content: string;
  mediaUrl: string | null;
  mediaThumbnailUrl: string | null;
  mediaSize: number | null;
  mediaName: string | null;
  mediaDuration: number | null;
  replyTo: {
    messageId: string;
    senderId: string;
    content: string;
    type: string;
    mediaUrl?: string;
  } | null;
  isEdited: boolean;
  isDeletedForEveryone: boolean;
  isPinned: boolean;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  sentAt: any;
  deliveredAt: any;
  readAt: any;
  reactions?: Record<string, string[]>;
}

interface ChatContextType {
  chats: Chat[];
  activeChatId: string | null;
  activeChat: Chat | null;
  messages: Message[];
  loadingChats: boolean;
  loadingMessages: boolean;
  error: string | null;
  selectChat: (chatId: string) => void;
  startChatWithUser: (username: string) => Promise<string>;
  sendTextMessage: (text: string, replyTo?: any) => Promise<void>;
  sendMediaMessage: (type: 'image' | 'video' | 'audio' | 'voice_note' | 'document' | 'gif' | 'sticker', mediaUrl: string, options?: Partial<Message>) => Promise<void>;
  markActiveChatAsRead: () => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string, mode: 'me' | 'everyone') => Promise<void>;
  reactToMessage: (messageId: string, reaction: string) => Promise<void>;
  togglePinMessage: (messageId: string) => Promise<void>;
  clearChatHistory: (chatId: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  toggleStarMessage: (messageId: string) => Promise<void>;
  fetchStarredMessages: () => Promise<any[]>;
  blockUser: (targetUserId: string) => Promise<void>;
  unblockUser: (targetUserId: string) => Promise<void>;
  fetchBlockedUsers: () => Promise<any[]>;
  updateChatSettings: (chatId: string, updates: any) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingChats, setLoadingChats] = useState<boolean>(true);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activeChat = chats.find(c => c.chatId === activeChatId) || null;

  // 1. Listen to user's chat list in real-time
  useEffect(() => {
    if (!user) {
      setChats([]);
      setActiveChatId(null);
      setLoadingChats(false);
      return;
    }

    setLoadingChats(true);
    const chatsQuery = query(
      collection(db, 'chats'),
      where('participantIds', 'array-contains', user.userId)
    );

    const unsubscribe = onSnapshot(chatsQuery, async (snapshot) => {
      const chatsList: Chat[] = [];
      
      for (const changeDoc of snapshot.docs) {
        const chatData = changeDoc.data() as Omit<Chat, 'chatId'>;
        const chatId = changeDoc.id;
        
        let metadata = chatData.metadata;

        // For 1:1 chats, dynamically fetch recipient's profile details if not stored or stale
        if (chatData.type === 'one_to_one') {
          const recipientId = chatData.participantIds.find(id => id !== user.userId);
          if (recipientId) {
            try {
              const recipientDoc = await getDoc(doc(db, 'users', recipientId));
              if (recipientDoc.exists()) {
                const rData = recipientDoc.data();
                metadata = {
                  recipientName: rData.name,
                  recipientUsername: rData.username,
                  recipientPhotoUrl: rData.profilePhotoUrl || null
                };
              }
            } catch (e) {
              console.error('Error fetching recipient details:', e);
            }
          }
        }

        let settings = {
          isPinned: false,
          isArchived: false,
          isMuted: false,
          muteUntil: null,
          wallpaper: null,
          unreadCount: 0,
          lastReadMessageId: ''
        };

        try {
          const settingsDoc = await getDoc(doc(db, 'chats', chatId, 'settings', user.userId));
          if (settingsDoc.exists()) {
            const sData = settingsDoc.data();
            settings = {
              isPinned: sData.isPinned || false,
              isArchived: sData.isArchived || false,
              isMuted: sData.isMuted || false,
              muteUntil: sData.muteUntil || null,
              wallpaper: sData.wallpaper || null,
              unreadCount: sData.unreadCount || 0,
              lastReadMessageId: sData.lastReadMessageId || ''
            };
          }
        } catch (e) {
          console.error('Error fetching chat settings:', e);
        }

        chatsList.push({
          chatId,
          ...chatData,
          metadata,
          settings
        });
      }

      // Sort chats locally by lastMessageAt desc
      chatsList.sort((a, b) => {
        const timeA = a.lastMessageAt?.toMillis ? a.lastMessageAt.toMillis() : (a.lastMessageAt?.seconds ? a.lastMessageAt.seconds * 1000 : 0);
        const timeB = b.lastMessageAt?.toMillis ? b.lastMessageAt.toMillis() : (b.lastMessageAt?.seconds ? b.lastMessageAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      setChats(chatsList);
      setLoadingChats(false);
    }, (err) => {
      console.error('Firestore chats listener error:', err);
      setError('Failed to subscribe to chat list updates.');
      setLoadingChats(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 2. Listen to messages in the active chat
  useEffect(() => {
    if (!activeChatId || !user) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    setLoadingMessages(true);
    const messagesQuery = query(
      collection(db, 'messages', activeChatId, 'chatMessages'),
      orderBy('sentAt', 'asc')
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messagesList: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as any;
        if (data.deletedForUsers && data.deletedForUsers.includes(user.userId)) {
          return;
        }
        messagesList.push({ messageId: doc.id, ...data } as Message);
      });
      setMessages(messagesList);
      setLoadingMessages(false);

      // Automatically trigger mark as read when new messages arrive on the screen
      markActiveChatAsRead();
    }, (err) => {
      console.error('Firestore messages listener error:', err);
      setError('Failed to subscribe to message history.');
      setLoadingMessages(false);
    });

    return () => unsubscribe();
  }, [activeChatId, user]);

  const selectChat = (chatId: string) => {
    setActiveChatId(chatId);
  };

  // 3. Start chat with username
  const startChatWithUser = async (username: string): Promise<string> => {
    setError(null);
    try {
      const res = await axios.post(`${API_URL}/chats`, { recipientUsername: username });
      const newChat = res.data as Chat;
      
      // Immediately add the chat to state so activeChat is non-null
      // Even though the Firestore listener will also add it eventually
      setChats(prev => {
        const exists = prev.find(c => c.chatId === newChat.chatId);
        if (exists) return prev;
        return [newChat, ...prev];
      });
      
      setActiveChatId(newChat.chatId);
      return newChat.chatId;
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'Failed to start chat';
      setError(errMsg);
      throw new Error(errMsg);
    }
  };

  // 4. Send text message
  const sendTextMessage = async (text: string, replyTo?: any) => {
    if (!activeChatId || !user) return;
    try {
      await axios.post(`${API_URL}/chats/${activeChatId}/messages`, {
        type: 'text',
        content: text,
        replyTo: replyTo || null
      });
    } catch (err: any) {
      console.error('Failed to send text message:', err);
      setError(err.response?.data?.error || 'Failed to send message');
    }
  };

  // 5. Send media message
  const sendMediaMessage = async (
    type: 'image' | 'video' | 'audio' | 'voice_note' | 'document' | 'gif' | 'sticker',
    mediaUrl: string,
    options?: Partial<Message>
  ) => {
    if (!activeChatId || !user) return;
    try {
      await axios.post(`${API_URL}/chats/${activeChatId}/messages`, {
        type,
        mediaUrl,
        content: options?.content || '',
        mediaThumbnailUrl: options?.mediaThumbnailUrl || null,
        mediaSize: options?.mediaSize || null,
        mediaName: options?.mediaName || null,
        mediaDuration: options?.mediaDuration || null,
        replyTo: options?.replyTo || null
      });
    } catch (err: any) {
      console.error('Failed to send media message:', err);
      setError(err.response?.data?.error || 'Failed to send media message');
    }
  };

  // 6. Mark active chat as read
  const markActiveChatAsRead = async () => {
    if (!activeChatId || !user) return;
    try {
      await axios.post(`${API_URL}/chats/${activeChatId}/messages/read`);
    } catch (err) {
      console.error('Failed to mark chat as read:', err);
    }
  };

  // 7. Edit message
  const editMessage = async (messageId: string, content: string) => {
    if (!activeChatId) return;
    try {
      await axios.put(`${API_URL}/chats/${activeChatId}/messages/${messageId}`, { content });
    } catch (err: any) {
      console.error('Failed to edit message:', err);
      setError(err.response?.data?.error || 'Failed to edit message');
    }
  };

  // 8. Delete message
  const deleteMessage = async (messageId: string, mode: 'me' | 'everyone') => {
    if (!activeChatId) return;
    try {
      await axios.delete(`${API_URL}/chats/${activeChatId}/messages/${messageId}`, {
        params: { mode }
      });
    } catch (err: any) {
      console.error('Failed to delete message:', err);
      setError(err.response?.data?.error || 'Failed to delete message');
    }
  };

  // 9. React to message
  const reactToMessage = async (messageId: string, reaction: string) => {
    if (!activeChatId) return;
    try {
      await axios.post(`${API_URL}/chats/${activeChatId}/messages/${messageId}/react`, { reaction });
    } catch (err: any) {
      console.error('Failed to react to message:', err);
    }
  };

  // 10. Pin message
  const togglePinMessage = async (messageId: string) => {
    if (!activeChatId) return;
    try {
      await axios.post(`${API_URL}/chats/${activeChatId}/messages/${messageId}/pin`);
    } catch (err: any) {
      console.error('Failed to pin message:', err);
    }
  };

  // 11. Clear chat history
  const clearChatHistory = async (chatId: string) => {
    try {
      await axios.post(`${API_URL}/chats/${chatId}/clear`);
    } catch (err: any) {
      console.error('Failed to clear chat:', err);
    }
  };

  // 12. Delete chat
  const deleteChat = async (chatId: string) => {
    try {
      await axios.delete(`${API_URL}/chats/${chatId}`);
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }
    } catch (err: any) {
      console.error('Failed to delete chat:', err);
    }
  };

  // 13. Star message
  const toggleStarMessage = async (messageId: string) => {
    if (!activeChatId) return;
    try {
      await axios.post(`${API_URL}/chats/${activeChatId}/messages/${messageId}/star`);
    } catch (err: any) {
      console.error('Failed to star message:', err);
    }
  };

  // 14. Fetch starred messages
  const fetchStarredMessages = async (): Promise<any[]> => {
    try {
      const res = await axios.get(`${API_URL}/chats/starred`);
      return res.data;
    } catch (err) {
      console.error('Failed to fetch starred messages:', err);
      return [];
    }
  };

  // 15. Block user
  const blockUser = async (targetUserId: string) => {
    try {
      await axios.post(`${API_URL}/profile/block`, { targetUserId });
    } catch (err) {
      console.error('Failed to block user:', err);
    }
  };

  // 16. Unblock user
  const unblockUser = async (targetUserId: string) => {
    try {
      await axios.post(`${API_URL}/profile/unblock`, { targetUserId });
    } catch (err) {
      console.error('Failed to unblock user:', err);
    }
  };

  // 17. Fetch blocked users
  const fetchBlockedUsers = async (): Promise<any[]> => {
    try {
      const res = await axios.get(`${API_URL}/profile/blocked`);
      return res.data;
    } catch (err) {
      console.error('Failed to fetch blocked users:', err);
      return [];
    }
  };

  return (
    <ChatContext.Provider
      value={{
        chats,
        activeChatId,
        activeChat,
        messages,
        loadingChats,
        loadingMessages,
        error,
        selectChat,
        startChatWithUser,
        sendTextMessage,
        sendMediaMessage,
        markActiveChatAsRead,
        editMessage,
        deleteMessage,
        reactToMessage,
        togglePinMessage,
        clearChatHistory,
        deleteChat,
        toggleStarMessage,
        fetchStarredMessages,
        blockUser,
        unblockUser,
        fetchBlockedUsers,
        updateChatSettings: async (chatId: string, updates: any) => {
          if (!user) return;
          try {
            const settingsRef = doc(db, 'chats', chatId, 'settings', user.userId);
            await setDoc(settingsRef, updates, { merge: true });
          } catch (err) {
            console.error('Failed to update chat settings:', err);
          }
        }
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChats = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChats must be used within a ChatProvider');
  }
  return context;
};
