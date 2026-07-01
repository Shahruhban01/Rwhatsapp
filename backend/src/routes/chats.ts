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


// ─── GROUP CHAT ENDPOINTS ──────────────────────────────────────────────────

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


// ─── RICH MESSAGING OPERATION ENDPOINTS ──────────────────────────────────────

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
  const { reaction } = req.body; // e.g. '👍', '❤️', or empty/null to remove all reaction by user

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

export default router;


