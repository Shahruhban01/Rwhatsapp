"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const admin = __importStar(require("firebase-admin"));
const firebase_1 = require("../config/firebase");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
// 1. GET /api/chats (Fetch all active chats for the authenticated user)
router.get('/', auth_1.requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        // Query chats where participantIds contains the userId, ordered by lastMessageAt desc
        const chatsSnapshot = await firebase_1.db.collection('chats')
            .where('participantIds', 'array-contains', userId)
            .orderBy('lastMessageAt', 'desc')
            .get();
        const chatsList = [];
        chatsSnapshot.forEach((doc) => {
            chatsList.push({ chatId: doc.id, ...doc.data() });
        });
        return res.status(200).json(chatsList);
    }
    catch (err) {
        console.error('Error fetching chats:', err);
        return res.status(500).json({ error: 'Internal server error fetching chats' });
    }
});
// 2. POST /api/chats (Create or retrieve 1:1 chat with recipientUsername)
router.post('/', auth_1.requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    let { recipientUsername, type } = req.body;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!recipientUsername) {
        return res.status(400).json({ error: 'Recipient username is required' });
    }
    if (recipientUsername.startsWith('@')) {
        recipientUsername = recipientUsername.substring(1);
    }
    recipientUsername = recipientUsername.toLowerCase();
    try {
        // 1. Resolve recipient username to userId
        const usernameDoc = await firebase_1.db.collection('usernames').doc(recipientUsername).get();
        if (!usernameDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        const recipientId = usernameDoc.data()?.userId;
        if (recipientId === userId) {
            return res.status(400).json({ error: 'You cannot start a chat with yourself' });
        }
        // 2. Check if a 1:1 chat already exists between these two users
        const existingChatsQuery = await firebase_1.db.collection('chats')
            .where('type', '==', 'one_to_one')
            .where('participantIds', 'array-contains', userId)
            .get();
        let existingChat = null;
        existingChatsQuery.forEach((doc) => {
            const data = doc.data();
            if (data.participantIds.includes(recipientId)) {
                existingChat = { chatId: doc.id, ...data };
            }
        });
        if (existingChat) {
            return res.status(200).json(existingChat);
        }
        // 3. Resolve user details for recipient and sender to store metadata if needed
        const recipientDoc = await firebase_1.db.collection('users').doc(recipientId).get();
        const recipientData = recipientDoc.data();
        // 4. Create new chat
        const chatId = (0, uuid_1.v4)();
        const newChat = {
            chatId,
            type: 'one_to_one',
            participantIds: [userId, recipientId],
            lastMessage: null,
            lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: userId,
            metadata: {
                recipientName: recipientData?.name || recipientUsername,
                recipientUsername: recipientUsername,
                recipientPhotoUrl: recipientData?.profilePhotoUrl || null
            }
        };
        await firebase_1.db.collection('chats').doc(chatId).set(newChat);
        return res.status(201).json(newChat);
    }
    catch (err) {
        console.error('Error starting chat:', err);
        return res.status(500).json({ error: 'Internal server error starting chat' });
    }
});
// 3. POST /api/chats/:chatId/messages (Send a message)
router.post('/:chatId/messages', auth_1.requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    const { chatId } = req.params;
    const { messageId, type, content, mediaUrl, mediaThumbnailUrl, mediaSize, mediaName, mediaDuration, replyTo } = req.body;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        // 1. Verify user is in chat participants
        const chatDoc = await firebase_1.db.collection('chats').doc(chatId).get();
        if (!chatDoc.exists) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        const chatData = chatDoc.data();
        if (!chatData || !chatData.participantIds.includes(userId)) {
            return res.status(403).json({ error: 'Forbidden: You are not a participant in this chat' });
        }
        // 2. Validate content depending on type
        if (type === 'text' && (!content || content.trim() === '')) {
            return res.status(400).json({ error: 'Message content cannot be empty' });
        }
        if (type !== 'text' && !mediaUrl) {
            return res.status(400).json({ error: 'Media URL is required for media messages' });
        }
        const resolvedMessageId = messageId || (0, uuid_1.v4)();
        const serverTime = admin.firestore.FieldValue.serverTimestamp();
        const message = {
            messageId: resolvedMessageId,
            chatId,
            senderId: userId,
            type: type || 'text',
            content: content || '',
            mediaUrl: mediaUrl || null,
            mediaThumbnailUrl: mediaThumbnailUrl || null,
            mediaSize: mediaSize || null,
            mediaName: mediaName || null,
            mediaDuration: mediaDuration || null,
            replyTo: replyTo || null,
            isEdited: false,
            isDeletedForEveryone: false,
            isPinned: false,
            status: 'sent',
            sentAt: serverTime,
            deliveredAt: null,
            readAt: null
        };
        // Update messages collection and lastMessage snapshot on chat
        const batch = firebase_1.db.batch();
        const messageDocRef = firebase_1.db.collection('messages').doc(chatId).collection('chatMessages').doc(resolvedMessageId);
        batch.set(messageDocRef, message);
        const chatDocRef = firebase_1.db.collection('chats').doc(chatId);
        batch.update(chatDocRef, {
            lastMessage: {
                messageId: resolvedMessageId,
                senderId: userId,
                content: type === 'text' ? content : `[${type}]`,
                type,
                timestamp: serverTime,
                status: 'sent'
            },
            lastMessageAt: serverTime
        });
        await batch.commit();
        return res.status(200).json({
            success: true,
            messageId: resolvedMessageId,
            status: 'sent'
        });
    }
    catch (err) {
        console.error('Error sending message:', err);
        return res.status(500).json({ error: 'Internal server error sending message' });
    }
});
// 4. GET /api/chats/:chatId/messages (Fetch message history - ordered oldest first)
router.get('/:chatId/messages', auth_1.requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    const { chatId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before; // Cursor pagination support
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        // 1. Verify user is in chat
        const chatDoc = await firebase_1.db.collection('chats').doc(chatId).get();
        if (!chatDoc.exists) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        const chatData = chatDoc.data();
        if (!chatData || !chatData.participantIds.includes(userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        // 2. Query messages
        let messagesQuery = firebase_1.db.collection('messages')
            .doc(chatId)
            .collection('chatMessages')
            .orderBy('sentAt', 'desc'); // fetch recent first for pagination
        if (before) {
            const cursorDoc = await firebase_1.db.collection('messages').doc(chatId).collection('chatMessages').doc(before).get();
            if (cursorDoc.exists) {
                messagesQuery = messagesQuery.startAfter(cursorDoc);
            }
        }
        const messagesSnapshot = await messagesQuery.limit(limit).get();
        const messages = [];
        messagesSnapshot.forEach((doc) => {
            messages.push({ messageId: doc.id, ...doc.data() });
        });
        // Reverse list so client receives them oldest first (chronological order)
        return res.status(200).json(messages.reverse());
    }
    catch (err) {
        console.error('Error fetching messages:', err);
        return res.status(500).json({ error: 'Internal server error fetching messages' });
    }
});
// 5. POST /api/chats/:chatId/messages/read (Mark all messages as read)
router.post('/:chatId/messages/read', auth_1.requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    const { chatId } = req.params;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        // Verify membership
        const chatDoc = await firebase_1.db.collection('chats').doc(chatId).get();
        if (!chatDoc.exists) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        const chatData = chatDoc.data();
        if (!chatData || !chatData.participantIds.includes(userId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        // Find all unread messages sent by OTHER participants in this chat
        const unreadSnapshot = await firebase_1.db.collection('messages')
            .doc(chatId)
            .collection('chatMessages')
            .where('senderId', '!=', userId)
            .where('status', '!=', 'read')
            .get();
        if (unreadSnapshot.empty) {
            return res.status(200).json({ success: true, count: 0 });
        }
        const batch = firebase_1.db.batch();
        unreadSnapshot.docs.forEach((doc) => {
            batch.update(doc.ref, {
                status: 'read',
                readAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        // Check if the chat's last message needs status update (if it was read)
        const chatDetails = chatDoc.data();
        if (chatDetails && chatDetails.lastMessage && chatDetails.lastMessage.senderId !== userId && chatDetails.lastMessage.status !== 'read') {
            await firebase_1.db.collection('chats').doc(chatId).update({
                'lastMessage.status': 'read'
            });
        }
        return res.status(200).json({ success: true, count: unreadSnapshot.size });
    }
    catch (err) {
        console.error('Error marking messages as read:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
