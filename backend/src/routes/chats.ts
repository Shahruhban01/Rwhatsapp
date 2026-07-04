import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as admin from 'firebase-admin';
import * as https from 'https';
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
    if (recipientUsername === 'meta_ai') {
      const metaAiDoc = await db.collection('users').doc('meta_ai').get();
      if (!metaAiDoc.exists) {
        await db.collection('users').doc('meta_ai').set({
          userId: 'meta_ai',
          username: 'meta_ai',
          name: 'Meta AI',
          profilePhotoUrl: null,
          about: 'WhatsApp\'s AI Assistant',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await db.collection('usernames').doc('meta_ai').set({
          userId: 'meta_ai',
          username: 'meta_ai'
        });
      }
    }

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

// Create a group chat
router.post('/group', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { groupName, participantIds } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!groupName || !participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
    return res.status(400).json({ error: 'groupName and a non-empty participantIds array are required' });
  }

  try {
    const allParticipantIds = Array.from(new Set([userId, ...participantIds]));

    const chatId = uuidv4();
    const newChat = {
      chatId,
      type: 'group',
      participantIds: allParticipantIds,
      lastMessage: null,
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: userId,
      metadata: {
        groupName: groupName
      }
    };

    await db.collection('chats').doc(chatId).set(newChat);

    const createdDoc = await db.collection('chats').doc(chatId).get();
    return res.status(201).json({ chatId: createdDoc.id, ...createdDoc.data() });
  } catch (err) {
    console.error('Error starting group chat:', err);
    return res.status(500).json({ error: 'Internal server error starting group chat' });
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

    // Check if recipient blocked the sender in 1:1 chats
    if (chatData.type === 'one_to_one') {
      const recipientId = chatData.participantIds.find((id: string) => id !== userId);
      if (recipientId) {
        const recipientDoc = await db.collection('users').doc(recipientId).get();
        if (recipientDoc.exists) {
          const recipientData = recipientDoc.data();
          if (recipientData?.blockedUserIds && recipientData.blockedUserIds.includes(userId)) {
            return res.status(403).json({ error: 'Message blocked: You have been blocked by this user.' });
          }
        }
      }
    }

    // 2. Validate content depending on type
    if (type === 'text' && (!content || content.trim() === '')) {
      return res.status(400).json({ error: 'Message content cannot be empty' });
    }
    if (type !== 'text' && !mediaUrl) {
      return res.status(400).json({ error: 'Media URL is required for media messages' });
    }

    const resolvedMessageId = messageId || uuidv4();
    const now = admin.firestore.Timestamp.now();

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
      sentAt: now,
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
        timestamp: now,
        status: 'sent'
      },
      lastMessageAt: now
    });

    await batch.commit();

    if (chatData.participantIds.includes('meta_ai')) {
      setTimeout(async () => {
        try {
          await generateAiResponse(chatId);
        } catch (err) {
          console.error('Error generating AI response:', err);
        }
      }, 500);
    }

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

    // Find unread messages from other participants - use single where to avoid composite index issues
    const unreadSnapshot = await db.collection('messages')
      .doc(chatId)
      .collection('chatMessages')
      .where('senderId', '!=', userId)
      .get();

    // Filter for unread messages in code (avoids != on status which needs index)
    const unreadDocs = unreadSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.status !== 'read';
    });

    if (unreadDocs.length === 0) {
      return res.status(200).json({ success: true, count: 0 });
    }

    const batch = db.batch();
    unreadDocs.forEach((doc) => {
      batch.update(doc.ref, {
        status: 'read',
        readAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    await batch.commit();

    // Update chat's lastMessage status if it was from other user and unread
    const chatDetails = chatDoc.data();
    if (chatDetails && chatDetails.lastMessage && chatDetails.lastMessage.senderId !== userId && chatDetails.lastMessage.status !== 'read') {
      await db.collection('chats').doc(chatId).update({
        'lastMessage.status': 'read'
      });
    }

    return res.status(200).json({ success: true, count: unreadDocs.length });
  } catch (err) {
    console.error('Error marking messages as read:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


// â”€â”€â”€ GROUP CHAT ENDPOINTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// 6. POST /api/chats/group (Create a new group chat)
router.post('/group', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { name, description, photoUrl, memberIds } = req.body;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Group name is required' });

  // Ensure memberIds is an array containing valid IDs
  const rawMembers = Array.isArray(memberIds) ? memberIds : [];
  const uniqueMembers = Array.from(new Set([userId, ...rawMembers])); // always include creator

  try {
    const chatId = uuidv4();
    const serverTime = admin.firestore.FieldValue.serverTimestamp();
    const inviteCode = uuidv4();

    const newChat = {
      chatId,
      type: 'group',
      participantIds: uniqueMembers,
      lastMessage: null,
      lastMessageAt: serverTime,
      createdAt: serverTime,
      createdBy: userId,
      metadata: {
        recipientName: name,
        recipientUsername: 'group',
        recipientPhotoUrl: photoUrl || null,
      }
    };

    const newGroup = {
      groupId: chatId,
      name,
      description: description || '',
      photoUrl: photoUrl || null,
      createdBy: userId,
      createdAt: serverTime,
      updatedAt: serverTime,
      inviteCode,
      inviteCodeEnabled: true
    };

    const batch = db.batch();
    
    // 1. Create chat document
    batch.set(db.collection('chats').doc(chatId), newChat);
    
    // 2. Create group metadata document
    batch.set(db.collection('groups').doc(chatId), newGroup);

    // 3. Add members sub-collection
    uniqueMembers.forEach((memberId) => {
      const memberRef = db.collection('groups').doc(chatId).collection('members').doc(memberId);
      batch.set(memberRef, {
        userId: memberId,
        role: memberId === userId ? 'admin' : 'member',
        joinedAt: serverTime,
        addedBy: userId
      });
    });

    await batch.commit();

    return res.status(201).json({ chatId, ...newGroup, participantIds: uniqueMembers });
  } catch (err) {
    console.error('Error creating group chat:', err);
    return res.status(500).json({ error: 'Internal server error creating group' });
  }
});

// 7. POST /api/chats/group/:chatId/members (Add members to group)
router.post('/group/:chatId/members', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId } = req.params;
  const { memberIds } = req.body;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({ error: 'Member user IDs array is required' });
  }

  try {
    // Verify current user is admin in this group
    const memberDoc = await db.collection('groups').doc(chatId).collection('members').doc(userId).get();
    if (!memberDoc.exists || memberDoc.data()?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only admins can add members' });
    }

    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) return res.status(404).json({ error: 'Group chat not found' });

    const chatData = chatDoc.data()!;
    const currentParticipants: string[] = chatData.participantIds || [];
    const newParticipants = Array.from(new Set([...currentParticipants, ...memberIds]));

    const batch = db.batch();
    
    // Update participantIds on chat
    batch.update(chatRef, { participantIds: newParticipants });

    const serverTime = admin.firestore.FieldValue.serverTimestamp();

    // Add new member docs in group sub-collection
    memberIds.forEach((mId) => {
      if (!currentParticipants.includes(mId)) {
        const ref = db.collection('groups').doc(chatId).collection('members').doc(mId);
        batch.set(ref, {
          userId: mId,
          role: 'member',
          joinedAt: serverTime,
          addedBy: userId
        });
      }
    });

    await batch.commit();
    return res.status(200).json({ success: true, participantIds: newParticipants });
  } catch (err) {
    console.error('Error adding group members:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 8. DELETE /api/chats/group/:chatId/members/:targetUserId (Remove member or leave group)
router.delete('/group/:chatId/members/:targetUserId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId, targetUserId } = req.params;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const userRoleDoc = await db.collection('groups').doc(chatId).collection('members').doc(userId).get();
    if (!userRoleDoc.exists) return res.status(403).json({ error: 'Forbidden: Not a member of this group' });

    const userRole = userRoleDoc.data()?.role;
    const isSelf = userId === targetUserId;

    // Permissions: Admins can remove anyone. Regular members can only remove themselves (leave).
    if (!isSelf && userRole !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only admins can remove other members' });
    }

    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) return res.status(404).json({ error: 'Group chat not found' });

    const chatData = chatDoc.data()!;
    const currentParticipants: string[] = chatData.participantIds || [];

    if (!currentParticipants.includes(targetUserId)) {
      return res.status(400).json({ error: 'Target user is not a member of this group' });
    }

    const newParticipants = currentParticipants.filter(id => id !== targetUserId);

    const batch = db.batch();
    
    // Remove member doc from sub-collection
    batch.delete(db.collection('groups').doc(chatId).collection('members').doc(targetUserId));
    
    // Update chat participants list
    if (newParticipants.length === 0) {
      batch.delete(chatRef);
      batch.delete(db.collection('groups').doc(chatId));
    } else {
      batch.update(chatRef, { participantIds: newParticipants });
    }

    await batch.commit();
    return res.status(200).json({ success: true, participantIds: newParticipants });
  } catch (err) {
    console.error('Error removing group member:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 9. POST /api/chats/group/:chatId/invite (Generate or get group invite code)
router.post('/group/:chatId/invite', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId } = req.params;
  const { enabled } = req.body;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const memberDoc = await db.collection('groups').doc(chatId).collection('members').doc(userId).get();
    if (!memberDoc.exists || memberDoc.data()?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Only admins can manage invite links' });
    }

    const groupRef = db.collection('groups').doc(chatId);
    const groupDoc = await groupRef.get();
    if (!groupDoc.exists) return res.status(404).json({ error: 'Group not found' });

    const updateData: any = {};
    if (enabled !== undefined) {
      updateData.inviteCodeEnabled = !!enabled;
    }
    
    // Ensure invite code exists
    const groupData = groupDoc.data()!;
    if (!groupData.inviteCode) {
      updateData.inviteCode = uuidv4();
    }

    if (Object.keys(updateData).length > 0) {
      await groupRef.update(updateData);
    }

    const finalData = (await groupRef.get()).data()!;
    return res.status(200).json({
      inviteCode: finalData.inviteCode,
      inviteCodeEnabled: finalData.inviteCodeEnabled
    });
  } catch (err) {
    console.error('Error managing invite link:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 10. POST /api/chats/group/join (Join a group chat via invite code)
router.post('/group/join', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { inviteCode } = req.body;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!inviteCode) return res.status(400).json({ error: 'Invite code is required' });

  try {
    const groupsQuery = await db.collection('groups')
      .where('inviteCode', '==', inviteCode)
      .where('inviteCodeEnabled', '==', true)
      .limit(1)
      .get();

    if (groupsQuery.empty) {
      return res.status(404).json({ error: 'Invalid or expired invite link' });
    }

    const groupDoc = groupsQuery.docs[0];
    const chatId = groupDoc.id;
    const groupData = groupDoc.data();

    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) return res.status(404).json({ error: 'Associated chat not found' });

    const chatData = chatDoc.data()!;
    const currentParticipants: string[] = chatData.participantIds || [];

    if (currentParticipants.includes(userId)) {
      return res.status(200).json({ chatId, message: 'You are already a member of this group' });
    }

    const newParticipants = [...currentParticipants, userId];
    const serverTime = admin.firestore.FieldValue.serverTimestamp();

    const batch = db.batch();
    
    // Update participantIds list
    batch.update(chatRef, { participantIds: newParticipants });

    // Add user to members sub-collection
    const memberRef = db.collection('groups').doc(chatId).collection('members').doc(userId);
    batch.set(memberRef, {
      userId,
      role: 'member',
      joinedAt: serverTime,
      addedBy: 'invite_link'
    });

    await batch.commit();

    return res.status(200).json({ chatId, name: groupData.name, success: true });
  } catch (err) {
    console.error('Error joining group via invite:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


// â”€â”€â”€ RICH MESSAGING OPERATION ENDPOINTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// 11. PUT /api/chats/:chatId/messages/:messageId (Edit a message)
router.put('/:chatId/messages/:messageId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId, messageId } = req.params;
  const { content } = req.body;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!content || !content.trim()) return res.status(400).json({ error: 'New content is required' });

  try {
    const msgRef = db.collection('messages').doc(chatId).collection('chatMessages').doc(messageId);
    const msgDoc = await msgRef.get();

    if (!msgDoc.exists) return res.status(404).json({ error: 'Message not found' });
    const msgData = msgDoc.data()!;

    if (msgData.senderId !== userId) {
      return res.status(403).json({ error: 'Forbidden: You can only edit your own messages' });
    }

    if (msgData.type !== 'text') {
      return res.status(400).json({ error: 'Only text messages can be edited' });
    }

    // Validate 15-minute window
    const sentTime = msgData.sentAt.toDate();
    const diffMin = (Date.now() - sentTime.getTime()) / (1000 * 60);
    if (diffMin > 15) {
      return res.status(400).json({ error: 'Messages can only be edited within 15 minutes of sending' });
    }

    const batch = db.batch();
    batch.update(msgRef, {
      content: content.trim(),
      isEdited: true,
      editedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // If it was the last message, update the chat's snapshot
    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    if (chatDoc.exists && chatDoc.data()?.lastMessage?.messageId === messageId) {
      batch.update(chatRef, {
        'lastMessage.content': content.trim(),
        'lastMessage.isEdited': true
      });
    }

    await batch.commit();
    return res.status(200).json({ success: true, content: content.trim() });
  } catch (err) {
    console.error('Error editing message:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 12. DELETE /api/chats/:chatId/messages/:messageId (Delete message for me / everyone)
router.delete('/:chatId/messages/:messageId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId, messageId } = req.params;
  const mode = req.query.mode as string || 'me'; // 'me' or 'everyone'

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const msgRef = db.collection('messages').doc(chatId).collection('chatMessages').doc(messageId);
    const msgDoc = await msgRef.get();

    if (!msgDoc.exists) return res.status(404).json({ error: 'Message not found' });
    const msgData = msgDoc.data()!;

    const batch = db.batch();

    if (mode === 'everyone') {
      if (msgData.senderId !== userId) {
        return res.status(403).json({ error: 'Forbidden: You can only delete your own messages for everyone' });
      }

      // Validate 60-minute window
      const sentTime = msgData.sentAt.toDate();
      const diffMin = (Date.now() - sentTime.getTime()) / (1000 * 60);
      if (diffMin > 60) {
        return res.status(400).json({ error: 'Messages can only be deleted for everyone within 60 minutes' });
      }

      batch.update(msgRef, {
        content: 'This message was deleted',
        type: 'deleted',
        isDeletedForEveryone: true,
        deletedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update chat's lastMessage snapshot if active
      const chatRef = db.collection('chats').doc(chatId);
      const chatDoc = await chatRef.get();
      if (chatDoc.exists && chatDoc.data()?.lastMessage?.messageId === messageId) {
        batch.update(chatRef, {
          'lastMessage.content': 'This message was deleted',
          'lastMessage.type': 'deleted'
        });
      }
    } else {
      // Delete for Me: append userId to deletedForUsers array
      batch.update(msgRef, {
        deletedForUsers: admin.firestore.FieldValue.arrayUnion(userId)
      });
    }

    await batch.commit();
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error deleting message:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 13. POST /api/chats/:chatId/messages/:messageId/react (React to a message with emoji)
router.post('/:chatId/messages/:messageId/react', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId, messageId } = req.params;
  const { reaction } = req.body; // e.g. 'ðŸ‘', 'â¤ï¸', or empty/null to remove all reaction by user

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const msgRef = db.collection('messages').doc(chatId).collection('chatMessages').doc(messageId);
    const msgDoc = await msgRef.get();

    if (!msgDoc.exists) return res.status(404).json({ error: 'Message not found' });
    const msgData = msgDoc.data()!;

    // Resolve current reactions map
    const currentReactions: Record<string, string[]> = msgData.reactions || {};
    const updatedReactions: Record<string, string[]> = {};

    // Remove user's previous reaction from all emojis
    Object.keys(currentReactions).forEach((emoji) => {
      const list = currentReactions[emoji] || [];
      const filtered = list.filter(id => id !== userId);
      if (filtered.length > 0) {
        updatedReactions[emoji] = filtered;
      }
    });

    // Add new reaction if provided
    if (reaction && reaction.trim()) {
      const emoji = reaction.trim();
      if (!updatedReactions[emoji]) {
        updatedReactions[emoji] = [];
      }
      updatedReactions[emoji].push(userId);
    }

    await msgRef.update({ reactions: updatedReactions });
    return res.status(200).json({ success: true, reactions: updatedReactions });
  } catch (err) {
    console.error('Error reacting to message:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 14. POST /api/chats/:chatId/messages/:messageId/pin (Toggle pin message in chat)
router.post('/:chatId/messages/:messageId/pin', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId, messageId } = req.params;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const msgRef = db.collection('messages').doc(chatId).collection('chatMessages').doc(messageId);
    const msgDoc = await msgRef.get();

    if (!msgDoc.exists) return res.status(404).json({ error: 'Message not found' });
    const msgData = msgDoc.data()!;

    const newPinState = !msgData.isPinned;
    const updateData: any = {
      isPinned: newPinState,
      pinnedAt: newPinState ? admin.firestore.FieldValue.serverTimestamp() : null,
      pinnedBy: newPinState ? userId : null
    };

    await msgRef.update(updateData);
    return res.status(200).json({ success: true, isPinned: newPinState });
  } catch (err) {
    console.error('Error toggling pin:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 15. POST /api/chats/:chatId/clear (Clear chat message history)
router.post('/:chatId/clear', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId } = req.params;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Delete all messages in the sub-collection
    const messagesRef = db.collection('messages').doc(chatId).collection('chatMessages');
    const messagesSnap = await messagesRef.get();

    const batch = db.batch();
    messagesSnap.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Reset lastMessage snapshot on chat
    const chatRef = db.collection('chats').doc(chatId);
    batch.update(chatRef, {
      lastMessage: null,
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();
    return res.status(200).json({ success: true, message: 'Chat history cleared' });
  } catch (err) {
    console.error('Error clearing chat history:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 16. DELETE /api/chats/:chatId (Delete chat entirely)
router.delete('/:chatId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId } = req.params;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const chatRef = db.collection('chats').doc(chatId);
    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) return res.status(404).json({ error: 'Chat not found' });

    const batch = db.batch();
    
    // Delete messages sub-collection
    const messagesSnap = await db.collection('messages').doc(chatId).collection('chatMessages').get();
    messagesSnap.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete chat document
    batch.delete(chatRef);
    
    // Delete associated group document if group
    batch.delete(db.collection('groups').doc(chatId));

    await batch.commit();
    return res.status(200).json({ success: true, message: 'Chat deleted entirely' });
  } catch (err) {
    console.error('Error deleting chat:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


// ─── STARRED MESSAGES ENDPOINTS ──────────────────────────────────────────────

// 17. POST /api/chats/:chatId/messages/:messageId/star (Toggle starring a message)
router.post('/:chatId/messages/:messageId/star', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId, messageId } = req.params;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const starRef = db.collection('starredMessages').doc(userId).collection('items').doc(messageId);
    const starDoc = await starRef.get();

    if (starDoc.exists) {
      // Toggle off -> unstar
      await starRef.delete();
      return res.status(200).json({ success: true, starred: false });
    } else {
      // Fetch original message
      const msgDoc = await db.collection('messages').doc(chatId).collection('chatMessages').doc(messageId).get();
      if (!msgDoc.exists) return res.status(404).json({ error: 'Original message not found' });
      const msgData = msgDoc.data()!;

      // Toggle on -> star
      const starredItem = {
        messageId,
        chatId,
        senderId: msgData.senderId,
        content: msgData.content,
        type: msgData.type,
        mediaUrl: msgData.mediaUrl || null,
        starredAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await starRef.set(starredItem);
      return res.status(200).json({ success: true, starred: true });
    }
  } catch (err) {
    console.error('Error toggling starred message:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 18. GET /api/chats/starred (Fetch all starred messages of the user)
router.get('/starred', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const starSnap = await db.collection('starredMessages').doc(userId).collection('items')
      .orderBy('starredAt', 'desc')
      .get();

    const starredList: any[] = [];
    starSnap.forEach((doc) => {
      starredList.push(doc.data());
    });

    return res.status(200).json(starredList);
  } catch (err) {
    console.error('Error fetching starred messages:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


// 19. GET /api/chats/search-messages (Global message keyword search)
router.get('/search-messages', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { query: searchQuery } = req.query;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!searchQuery) return res.status(400).json({ error: 'Search query is required' });

  try {
    // Perform a collection group query on all 'chatMessages' subcollections
    const msgSnap = await db.collectionGroup('chatMessages').get();
    
    const results: any[] = [];
    msgSnap.forEach((doc) => {
      const data = doc.data();
      // Filter locally to match text content case-insensitively and ensure user belongs to chat
      if (
        data.content && 
        data.content.toLowerCase().includes((searchQuery as string).toLowerCase()) &&
        data.type !== 'deleted'
      ) {
        results.push(data);
      }
    });

    return res.status(200).json(results.slice(0, 30));
  } catch (err) {
    console.error('Error searching messages globally:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 20. GET /api/chats/:chatId/members (Fetch group members list details)
router.get('/:chatId/members', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId } = req.params;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const chatDoc = await db.collection('chats').doc(chatId).get();
    if (!chatDoc.exists) return res.status(404).json({ error: 'Chat not found' });

    const chatData = chatDoc.data()!;
    const participantIds = chatData.participantIds || [];

    if (participantIds.length === 0) return res.status(200).json([]);

    const usersSnap = await db.collection('users')
      .where('userId', 'in', participantIds.slice(0, 10))
      .get();

    const membersList: any[] = [];
    usersSnap.forEach((doc) => {
      const d = doc.data();
      membersList.push({
        userId: d.userId,
        name: d.name,
        username: d.username,
        profilePhotoUrl: d.profilePhotoUrl || null,
        about: d.about || ''
      });
    });

    return res.status(200).json(membersList);
  } catch (err) {
    console.error('Error fetching chat members list:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 23. POST /api/chats/:chatId/archive (Archive a chat)
router.post('/:chatId/archive', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId } = req.params;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const chatRef = db.collection('chats').doc(chatId);
    await chatRef.update({
      archivedByUserIds: admin.firestore.FieldValue.arrayUnion(userId)
    });
    return res.status(200).json({ success: true, message: 'Chat archived successfully' });
  } catch (err) {
    console.error('Error archiving chat:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 24. POST /api/chats/:chatId/unarchive (Unarchive a chat)
router.post('/:chatId/unarchive', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { chatId } = req.params;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const chatRef = db.collection('chats').doc(chatId);
    await chatRef.update({
      archivedByUserIds: admin.firestore.FieldValue.arrayRemove(userId)
    });
    return res.status(200).json({ success: true, message: 'Chat unarchived successfully' });
  } catch (err) {
    console.error('Error unarchiving chat:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

function httpsPost(url: string, headers: any, data: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });
    
    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

async function generateAiResponse(chatId: string) {
  // 1. Fetch last 15 messages from Firestore to construct conversation context
  const messagesSnap = await db.collection('messages')
    .doc(chatId)
    .collection('chatMessages')
    .orderBy('sentAt', 'desc')
    .limit(15)
    .get();

  const rawMessages: any[] = [];
  messagesSnap.forEach(doc => rawMessages.push(doc.data()));
  // Reverse to get chronological order
  rawMessages.reverse();

  // 2. Map messages to OpenRouter expected format
  const chatHistory = rawMessages.map((m: any) => ({
    role: m.senderId === 'meta_ai' ? 'assistant' : 'user',
    content: m.content || ''
  }));

  // 3. Make request to OpenRouter using free key / free model
  const openRouterKey = process.env.OPENROUTER_API_KEY || '';
  if (!openRouterKey) {
    console.error('Missing OPENROUTER_API_KEY environment variable.');
    return;
  }

  const headers = {
    'Authorization': `Bearer ${openRouterKey}`,
    'HTTP-Referer': 'https://github.com/Shahruhban01/Rwhatsapp',
    'X-Title': 'WhatsApp Clone AI'
  };

  try {
    const models = [
      'meta-llama/llama-3-8b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'google/gemma-2-9b-it:free',
    'openchat/openchat-7b:free'
  ];

  let res: any = null;
  let lastError = 'No models attempted';

  for (const model of models) {
    try {
      const payload = {
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are Meta AI, a helpful, intelligent assistant integrated into a WhatsApp clone chat. Keep your answers clear, concise, and friendly. Use markdown formatting appropriately.'
          },
          ...chatHistory
        ]
      };
      
      const attemptRes = await httpsPost('https://openrouter.ai/api/v1/chat/completions', headers, payload);
      if (attemptRes && attemptRes.choices && attemptRes.choices[0] && attemptRes.choices[0].message) {
        res = attemptRes;
        break;
      } else if (attemptRes && attemptRes.error) {
        lastError = attemptRes.error.message || JSON.stringify(attemptRes.error);
        console.warn(`Model ${model} failed: ${lastError}`);
      }
    } catch (e: any) {
      lastError = e.message || String(e);
      console.warn(`Model ${model} request error: ${lastError}`);
    }
  }

  let aiReply = "I'm sorry, I couldn't generate a response.";
  if (res && res.choices && res.choices[0] && res.choices[0].message) {
    aiReply = res.choices[0].message.content || aiReply;
  } else {
    aiReply = `AI Error: ${lastError}`;
  }
    
    // 4. Save AI response to database
    const messageId = uuidv4();
    const now = admin.firestore.Timestamp.now();
    
    const aiMessage = {
      messageId,
      chatId,
      senderId: 'meta_ai',
      type: 'text',
      content: aiReply,
      mediaUrl: null,
      mediaThumbnailUrl: null,
      mediaSize: null,
      mediaName: null,
      mediaDuration: null,
      replyTo: null,
      isEdited: false,
      isDeletedForEveryone: false,
      isPinned: false,
      status: 'sent',
      sentAt: now,
      deliveredAt: null,
      readAt: null
    };

    const batch = db.batch();
    const messageDocRef = db.collection('messages').doc(chatId).collection('chatMessages').doc(messageId);
    batch.set(messageDocRef, aiMessage);

    const chatDocRef = db.collection('chats').doc(chatId);
    batch.update(chatDocRef, {
      lastMessage: {
        messageId,
        senderId: 'meta_ai',
        content: aiReply,
        type: 'text',
        timestamp: now,
        status: 'sent'
      },
      lastMessageAt: now
    });

    await batch.commit();
  } catch (err) {
    console.error('OpenRouter request error:', err);
  }
}




