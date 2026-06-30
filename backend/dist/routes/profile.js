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
const firebase_1 = require("../config/firebase");
const auth_1 = require("../middlewares/auth");
const admin = __importStar(require("firebase-admin"));
const router = (0, express_1.Router)();
// Validate username regex: lowercase alphanumeric + underscore, 3-20 chars
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
// 1. POST /api/profile/username/check (Check availability)
router.post('/username/check', async (req, res) => {
    let { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    // Remove leading @ if present
    if (username.startsWith('@')) {
        username = username.substring(1);
    }
    username = username.toLowerCase();
    if (!USERNAME_REGEX.test(username)) {
        return res.status(400).json({
            error: 'Username must be 3-20 characters long and can only contain lowercase letters, numbers, and underscores.'
        });
    }
    try {
        const usernameDoc = await firebase_1.db.collection('usernames').doc(username).get();
        return res.status(200).json({ available: !usernameDoc.exists });
    }
    catch (err) {
        console.error('Error checking username:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 2. POST /api/profile/username/reserve (Claim/Update username)
router.post('/username/reserve', auth_1.requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    let { username } = req.body;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    if (username.startsWith('@')) {
        username = username.substring(1);
    }
    username = username.toLowerCase();
    if (!USERNAME_REGEX.test(username)) {
        return res.status(400).json({
            error: 'Username must be 3-20 characters long and can only contain lowercase letters, numbers, and underscores.'
        });
    }
    try {
        const result = await firebase_1.db.runTransaction(async (transaction) => {
            // 1. Check if the username is already taken
            const usernameDocRef = firebase_1.db.collection('usernames').doc(username);
            const usernameDoc = await transaction.get(usernameDocRef);
            if (usernameDoc.exists) {
                const ownerId = usernameDoc.data()?.userId;
                if (ownerId !== userId) {
                    throw new Error('USERNAME_TAKEN');
                }
                // If they already own it, no need to write again, just return success
                return { success: true, username };
            }
            // 2. Get the current user profile to see if they have an old username to clean up
            const userDocRef = firebase_1.db.collection('users').doc(userId);
            const userDoc = await transaction.get(userDocRef);
            if (!userDoc.exists) {
                throw new Error('USER_NOT_FOUND');
            }
            const userData = userDoc.data();
            const oldUsername = userData?.username;
            // 3. Delete old username from the usernames index collection if it exists
            if (oldUsername && oldUsername !== username) {
                const oldUsernameDocRef = firebase_1.db.collection('usernames').doc(oldUsername);
                transaction.delete(oldUsernameDocRef);
            }
            // 4. Register new username mapping
            transaction.set(usernameDocRef, { userId, username });
            // 5. Update user profile document
            transaction.update(userDocRef, {
                username: username,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return { success: true, username };
        });
        return res.status(200).json(result);
    }
    catch (err) {
        if (err.message === 'USERNAME_TAKEN') {
            return res.status(409).json({ error: 'Username is already taken' });
        }
        if (err.message === 'USER_NOT_FOUND') {
            return res.status(404).json({ error: 'User profile not found' });
        }
        console.error('Error reserving username:', err);
        return res.status(500).json({ error: 'Internal server error during reservation' });
    }
});
// 3. GET /api/profile (Get user profile)
router.get('/', auth_1.requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const userDoc = await firebase_1.db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        return res.status(200).json(userDoc.data());
    }
    catch (err) {
        console.error('Error fetching profile:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 4. PUT /api/profile (Update profile metadata name & about)
router.put('/', auth_1.requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    const { name, about } = req.body;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const updates = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        if (name !== undefined)
            updates.name = name;
        if (about !== undefined)
            updates.about = about;
        await firebase_1.db.collection('users').doc(userId).update(updates);
        return res.status(200).json({ success: true, updates });
    }
    catch (err) {
        console.error('Error updating profile:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
