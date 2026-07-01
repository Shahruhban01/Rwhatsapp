import { Router, Response } from 'express';
import { db } from '../config/firebase';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth';
import * as admin from 'firebase-admin';

const router = Router();

// GET /api/sessions — Fetch active sessions for the current user
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sessionsSnapshot = await db.collection('sessions')
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .get();

    const activeSessions: any[] = [];
    sessionsSnapshot.forEach((doc) => {
      const data = doc.data();
      activeSessions.push({
        sessionId: doc.id,
        deviceName: data.deviceName,
        platform: data.platform,
        ipAddress: data.ipAddress,
        createdAt: data.createdAt,
        lastActiveAt: data.lastActiveAt,
      });
    });

    return res.status(200).json(activeSessions);
  } catch (err) {
    console.error('Error fetching sessions:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/sessions/:sessionId — Revoke/Logout a specific session
router.delete('/:sessionId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { sessionId } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sessionRef = db.collection('sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionData = sessionDoc.data();
    if (!sessionData || sessionData.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden: You do not own this session' });
    }

    await sessionRef.update({
      isActive: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success: true, message: 'Session revoked successfully' });
  } catch (err) {
    console.error('Error revoking session:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
