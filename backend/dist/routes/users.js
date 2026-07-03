"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firebase_1 = require("../config/firebase");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
// GET /api/users  — list all users except self, optional ?search=query
router.get('/', auth_1.requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    const search = (req.query.search || '').toLowerCase().trim();
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    try {
        let usersSnap;
        if (search) {
            // Firestore prefix search on username
            usersSnap = await firebase_1.db.collection('users')
                .where('username', '>=', search)
                .where('username', '<=', search + '\uf8ff')
                .limit(30)
                .get();
        }
        else {
            usersSnap = await firebase_1.db.collection('users').limit(50).get();
        }
        const users = [];
        usersSnap.forEach((doc) => {
            const d = doc.data();
            if (d.userId === userId)
                return; // exclude self
            if (!d.username)
                return; // exclude accounts with no username
            users.push({
                userId: d.userId,
                username: d.username,
                name: d.name,
                profilePhotoUrl: d.profilePhotoUrl || null,
                about: d.about || '',
            });
        });
        return res.status(200).json(users);
    }
    catch (err) {
        console.error('Error listing users:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/users/:userId  — get details for a specific user
router.get('/:userId', auth_1.requireAuth, async (req, res) => {
    const userId = req.params.userId;
    try {
        const userDoc = await firebase_1.db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }
        const d = userDoc.data();
        return res.status(200).json({
            userId: d?.userId,
            username: d?.username,
            name: d?.name,
            profilePhotoUrl: d?.profilePhotoUrl || null,
            about: d?.about || '',
        });
    }
    catch (err) {
        console.error('Error fetching user details:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
