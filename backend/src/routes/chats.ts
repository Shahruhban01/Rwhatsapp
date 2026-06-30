import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth';

const router = Router();

// 1. GET /api/chats (Fetch all active chats for the authenticated user)
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Query chats where participantIds contains the userId, ordered by lastMessageAt desc
    const chatsSnapshot = await db.collection('chats')
      .where('participantIds', 'array-contains', userId)
      .orderBy('lastMessageAt', 'desc')
      .get();

    const chatsList: any[] = [];
    chatsSnapshot.forEach((doc) => {
      chatsList.push({ chatId: doc.id, ...doc.data() });
    });

    return res.status(200).json(chatsList);
  } catch (err) {
    console.error('Error fetching chats:', err);
    return res.status(500).json({ error: 'Internal server error fetching chats' });
  }
});

// 2. POST /api/chats (Create or retrieve 1:1 chat with recipientUsername)
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
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
    const usernameDoc = await db.collection('usernames').doc(recipientUsername).get();
    if (!usernameDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const recipientId = usernameDoc.data()?.userId;
    if (recipientId === userId) {
      return res.status(400).json({ error: 'You cannot start a chat with yourself' });
    }

    // 2. Check if a 1:1 chat already exists between these two users
    const existingChatsQuery = await db.collection('chats')
      .where('type', '==', 'one_to_one')
      .where('participantIds', 'array-contains', userId)
      .get();

    let existingChat: any = null;
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
    const recipientDoc = await db.collection('users').doc(recipientId).get();
    const recipientData = recipientDoc.data();

    // 4. Create new chat
    const chatId = uuidv4();
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

    await db.collection('chats').doc(chatId).set(newChat);

    // Read back to get resolved server timestamps instead of FieldValue sentinels
    const createdDoc = await db.collection('chats').doc(chatId).get();
    return res.status(201).json({ chatId: createdDoc.id, ...createdDoc.data() });
  } catch (err) {
    console.error('Error starting chat:', err);
    return res.status(500).json({ error: 'Internal server error starting chat' });
  }
});

// 3. POST /api/chats/:chatId/messages (Send a message)
router.post('/:chatId/messages', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId } = req.params;
  const { messageId, type, content, mediaUrl, mediaThumbnailUrl, mediaSize, mediaName, mediaDuration, replyTo } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Verify user is in chat participants
    const chatDoc = await db.collection('chats').doc(chatId).get();
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

    const resolvedMessageId = messageId || uuidv4();
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
    const batch = db.batch();
    
    const messageDocRef = db.collection('messages').doc(chatId).collection('chatMessages').doc(resolvedMessageId);
    batch.set(messageDocRef, message);

    const chatDocRef = db.collection('chats').doc(chatId);
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
  } catch (err) {
    console.error('Error sending message:', err);
    return res.status(500).json({ error: 'Internal server error sending message' });
  }
});

// 4. GET /api/chats/:chatId/messages (Fetch message history - ordered oldest first)
router.get('/:chatId/messages', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;
  const before = req.query.before as string; // Cursor pagination support

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 1. Verify user is in chat
    const chatDoc = await db.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const chatData = chatDoc.data();
    if (!chatData || !chatData.participantIds.includes(userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // 2. Query messages
    let messagesQuery = db.collection('messages')
      .doc(chatId)
      .collection('chatMessages')
      .orderBy('sentAt', 'desc'); // fetch recent first for pagination

    if (before) {
      const cursorDoc = await db.collection('messages').doc(chatId).collection('chatMessages').doc(before).get();
      if (cursorDoc.exists) {
        messagesQuery = messagesQuery.startAfter(cursorDoc);
      }
    }

    const messagesSnapshot = await messagesQuery.limit(limit).get();
    const messages: any[] = [];
    
    messagesSnapshot.forEach((doc) => {
      messages.push({ messageId: doc.id, ...doc.data() });
    });

    // Reverse list so client receives them oldest first (chronological order)
    return res.status(200).json(messages.reverse());
  } catch (err) {
    console.error('Error fetching messages:', err);
    return res.status(500).json({ error: 'Internal server error fetching messages' });
  }
});

// 5. POST /api/chats/:chatId/messages/read (Mark all messages as read)
router.post('/:chatId/messages/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Verify membership
    const chatDoc = await db.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const chatData = chatDoc.data();
    if (!chatData || !chatData.participantIds.includes(userId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Find all unread messages sent by OTHER participants in this chat
    const unreadSnapshot = await db.collection('messages')
      .doc(chatId)
      .collection('chatMessages')
      .where('senderId', '!=', userId)
      .where('status', '!=', 'read')
      .get();

    if (unreadSnapshot.empty) {
      return res.status(200).json({ success: true, count: 0 });
    }

    const batch = db.batch();
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
      await db.collection('chats').doc(chatId).update({
        'lastMessage.status': 'read'
      });
    }

    return res.status(200).json({ success: true, count: unreadSnapshot.size });
  } catch (err) {
    console.error('Error marking messages as read:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
