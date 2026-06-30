import { Router, Response } from 'express';
import { db } from '../config/firebase';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth';

const router = Router();

// GET /api/users  — list all users except self, optional ?search=query
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const search = (req.query.search as string || '').toLowerCase().trim();

  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    let usersSnap;

    if (search) {
      // Firestore prefix search on username
      usersSnap = await db.collection('users')
        .where('username', '>=', search)
        .where('username', '<=', search + '\uf8ff')
        .limit(30)
        .get();
    } else {
      usersSnap = await db.collection('users').limit(50).get();
    }

    const users: any[] = [];
    usersSnap.forEach((doc) => {
      const d = doc.data();
      if (d.userId === userId) return; // exclude self
      if (!d.username) return;         // exclude accounts with no username
      users.push({
        userId: d.userId,
        username: d.username,
        name: d.name,
        profilePhotoUrl: d.profilePhotoUrl || null,
        about: d.about || '',
      });
    });

    return res.status(200).json(users);
  } catch (err) {
    console.error('Error listing users:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
