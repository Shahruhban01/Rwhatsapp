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
// GET /api/sessions — Fetch active sessions for the current user
router.get('/', auth_1.requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const sessionsSnapshot = await firebase_1.db.collection('sessions')
            .where('userId', '==', userId)
            .where('isActive', '==', true)
            .get();
        const activeSessions = [];
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
    }
    catch (err) {
        console.error('Error fetching sessions:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/sessions/:sessionId — Revoke/Logout a specific session
router.delete('/:sessionId', auth_1.requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    const { sessionId } = req.params;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const sessionRef = firebase_1.db.collection('sessions').doc(sessionId);
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
    }
    catch (err) {
        console.error('Error revoking session:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
