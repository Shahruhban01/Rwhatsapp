import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from './AuthContext';

const API_URL = 'http://localhost:5000/api';

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

        chatsList.push({
          chatId,
          ...chatData,
          metadata
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
        messagesList.push({ messageId: doc.id, ...doc.data() } as Message);
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
        markActiveChatAsRead
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
