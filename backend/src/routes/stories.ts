import { Router, Response } from 'express';
import { db } from '../config/firebase';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth';
import * as admin from 'firebase-admin';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// 1. POST /api/stories (Post a new status update / story)
router.post('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { type, content, mediaUrl, backgroundColor, textColor, caption } = req.body;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  if (!type || !['text', 'image', 'video'].includes(type)) {
    return res.status(400).json({ error: 'Invalid story type. Must be text, image, or video.' });
  }

  try {
    const storyId = uuidv4();
    const serverTime = admin.firestore.FieldValue.serverTimestamp();
    
    const expiresAtDate = new Date();
    expiresAtDate.setHours(expiresAtDate.getHours() + 24); // 24 hours expiry

    const newStory = {
      storyId,
      userId,
      type,
      content: content || '',
      mediaUrl: mediaUrl || null,
      backgroundColor: backgroundColor || '#00a884',
      textColor: textColor || '#ffffff',
      caption: caption || '',
      privacyMode: 'all',
      privacyList: [],
      createdAt: serverTime,
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAtDate),
      isDeleted: false,
      viewCount: 0
    };

    await db.collection('stories').doc(storyId).set(newStory);

    return res.status(201).json(newStory);
  } catch (err) {
    console.error('Error posting story:', err);
    return res.status(500).json({ error: 'Internal server error posting story' });
  }
});

// 2. GET /api/stories (Retrieve all active stories of all users, grouped by user)
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const now = new Date();
    const storiesSnap = await db.collection('stories')
      .where('expiresAt', '>', admin.firestore.Timestamp.fromDate(now))
      .orderBy('expiresAt', 'desc')
      .get();

    // Group stories by userId
    const userStoriesMap: Record<string, any[]> = {};
    const userIdsToFetch: string[] = [];

    storiesSnap.forEach((doc) => {
      const data = doc.data();
      if (!userStoriesMap[data.userId]) {
        userStoriesMap[data.userId] = [];
        userIdsToFetch.push(data.userId);
      }
      userStoriesMap[data.userId].push({
        storyId: doc.id,
        ...data,
      });
    });

    if (userIdsToFetch.length === 0) {
      return res.status(200).json([]);
    }

    // Fetch user profiles to attach metadata
    const usersSnap = await db.collection('users')
      .where('userId', 'in', userIdsToFetch.slice(0, 10)) // Firestore limit of 10 for 'in' query
      .get();

    const usersMap: Record<string, any> = {};
    usersSnap.forEach((doc) => {
      const u = doc.data();
      usersMap[u.userId] = {
        userId: u.userId,
        name: u.name,
        username: u.username,
        profilePhotoUrl: u.profilePhotoUrl || null,
      };
    });

    const result = userIdsToFetch.map((uId) => ({
      user: usersMap[uId] || { userId: uId, name: 'Anonymous User', username: 'anon' },
      stories: userStoriesMap[uId].sort((a, b) => a.createdAt._seconds - b.createdAt._seconds)
    }));

    return res.status(200).json(result);
  } catch (err) {
    console.error('Error fetching stories:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. DELETE /api/stories/:storyId (Delete a story)
router.delete('/:storyId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { storyId } = req.params;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const storyRef = db.collection('stories').doc(storyId);
    const storySnap = await storyRef.get();

    if (!storySnap.exists) {
      return res.status(404).json({ error: 'Story not found' });
    }

    if (storySnap.data()?.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden: You do not own this story' });
    }

    await storyRef.delete();
    return res.status(200).json({ success: true, message: 'Story deleted' });
  } catch (err) {
    console.error('Error deleting story:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. POST /api/stories/:storyId/view (Mark story as viewed)
router.post('/:storyId/view', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { storyId } = req.params;

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const storyRef = db.collection('stories').doc(storyId);
    const viewRef = storyRef.collection('views').doc(userId);
    const viewDoc = await viewRef.get();

    if (!viewDoc.exists) {
      const serverTime = admin.firestore.FieldValue.serverTimestamp();
      
      const batch = db.batch();
      batch.set(viewRef, { userId, viewedAt: serverTime });
      batch.update(storyRef, { viewCount: admin.firestore.FieldValue.increment(1) });
      
      await batch.commit();
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Error marking story as viewed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
