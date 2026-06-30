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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = require("crypto");
const uuid_1 = require("uuid");
const admin = __importStar(require("firebase-admin"));
const qrcode_1 = __importDefault(require("qrcode"));
const firebase_1 = require("../config/firebase");
const jwt_1 = require("../utils/jwt");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
// 1. POST /api/auth/access-key (Login with Access Key)
router.post('/access-key', async (req, res) => {
    const { accessKey, deviceName, platform } = req.body;
    if (!accessKey) {
        return res.status(400).json({ error: 'Access Key is required' });
    }
    // Validate the access key
    const correctAccessKey = process.env.ACCESS_KEY || 'my-whatsapp-secret-key';
    if (accessKey !== correctAccessKey) {
        return res.status(401).json({ error: 'Invalid Access Key' });
    }
    try {
        // Look up existing user tied to this access key (stable login - same key = same user)
        const accessKeyId = Buffer.from(accessKey).toString('base64');
        const accessKeyRef = firebase_1.db.collection('accessKeys').doc(accessKeyId);
        const accessKeyDoc = await accessKeyRef.get();
        let userId;
        let existingUserData = null;
        if (accessKeyDoc.exists) {
            // Existing user — retrieve their userId
            userId = accessKeyDoc.data().userId;
            const userDoc = await firebase_1.db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                existingUserData = userDoc.data();
            }
        }
        else {
            // First-time login — create a new user
            userId = (0, uuid_1.v4)();
        }
        const sessionId = (0, uuid_1.v4)();
        // Create JWT tokens
        const jwtToken = (0, jwt_1.generateAccessToken)(userId, sessionId);
        const refreshToken = (0, jwt_1.generateRefreshToken)(userId, sessionId);
        const expiresAtDate = new Date();
        expiresAtDate.setDate(expiresAtDate.getDate() + 30);
        const session = {
            sessionId,
            userId,
            refreshToken,
            deviceName: deviceName || 'Unknown Device',
            platform: platform || 'unknown',
            ipAddress: req.ip || '0.0.0.0',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAtDate),
            isActive: true,
        };
        const batch = firebase_1.db.batch();
        batch.set(firebase_1.db.collection('sessions').doc(sessionId), session);
        let userPayload;
        if (existingUserData) {
            // Returning user — just update lastActiveAt on their profile
            batch.update(firebase_1.db.collection('users').doc(userId), {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            userPayload = {
                userId: existingUserData.userId,
                username: existingUserData.username || '',
                name: existingUserData.name,
                about: existingUserData.about,
                profilePhotoUrl: existingUserData.profilePhotoUrl,
            };
        }
        else {
            // New user — create user doc + accessKey mapping
            const newUser = {
                userId,
                username: '',
                name: deviceName ? `User (${deviceName})` : 'New User',
                about: 'Hey there! I am using WhatsApp.',
                profilePhotoUrl: null,
                blockedUserIds: [],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            batch.set(firebase_1.db.collection('users').doc(userId), newUser);
            batch.set(accessKeyRef, { userId, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            userPayload = {
                userId: newUser.userId,
                username: newUser.username,
                name: newUser.name,
                about: newUser.about,
                profilePhotoUrl: newUser.profilePhotoUrl,
            };
        }
        await batch.commit();
        return res.status(200).json({
            jwt: jwtToken,
            refreshToken,
            user: userPayload,
        });
    }
    catch (err) {
        console.error('Error creating user/session:', err);
        return res.status(500).json({ error: 'Internal server error during login' });
    }
});
// 2. POST /api/auth/refresh (Obtain new JWT via Refresh Token)
router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh Token is required' });
    }
    try {
        // Verify refresh token signature
        const decoded = (0, jwt_1.verifyRefreshToken)(refreshToken);
        const { userId, sessionId } = decoded;
        // Check session in Firestore
        const sessionDoc = await firebase_1.db.collection('sessions').doc(sessionId).get();
        if (!sessionDoc.exists) {
            return res.status(401).json({ error: 'Session not found' });
        }
        const sessionData = sessionDoc.data();
        if (!sessionData || !sessionData.isActive || sessionData.refreshToken !== refreshToken) {
            return res.status(401).json({ error: 'Invalid or inactive session' });
        }
        // Check expiry
        const expiresAt = sessionData.expiresAt;
        if (expiresAt.toDate() < new Date()) {
            return res.status(401).json({ error: 'Session expired' });
        }
        // Issue new access token
        const newJwtToken = (0, jwt_1.generateAccessToken)(userId, sessionId);
        // Update last active
        await firebase_1.db.collection('sessions').doc(sessionId).update({
            lastActiveAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.status(200).json({ jwt: newJwtToken });
    }
    catch (err) {
        console.error('Error refreshing token:', err);
        return res.status(401).json({ error: 'Invalid or expired Refresh Token' });
    }
});
// 3. POST /api/auth/logout (Revoke current session)
router.post('/logout', auth_1.requireAuth, async (req, res) => {
    const sessionId = req.user?.sessionId;
    if (!sessionId) {
        return res.status(400).json({ error: 'Invalid request: no session associated' });
    }
    try {
        await firebase_1.db.collection('sessions').doc(sessionId).update({
            isActive: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return res.status(200).json({ success: true });
    }
    catch (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: 'Internal server error during logout' });
    }
});
// 4. POST /api/auth/logout-all (Revoke all active sessions for the user)
router.post('/logout-all', auth_1.requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        return res.status(400).json({ error: 'Invalid request: no user associated' });
    }
    try {
        const activeSessionsQuery = await firebase_1.db.collection('sessions')
            .where('userId', '==', userId)
            .where('isActive', '==', true)
            .get();
        if (activeSessionsQuery.empty) {
            return res.status(200).json({ success: true });
        }
        const batch = firebase_1.db.batch();
        activeSessionsQuery.docs.forEach((doc) => {
            batch.update(doc.ref, {
                isActive: false,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        return res.status(200).json({ success: true });
    }
    catch (err) {
        console.error('Logout all error:', err);
        return res.status(500).json({ error: 'Internal server error during logout' });
    }
});
// 5. POST /api/auth/qr/request (Generate ephemeral QR session challenge for Web)
router.post('/qr/request', async (req, res) => {
    const qrSessionId = (0, uuid_1.v4)();
    const expiresAtDate = new Date(Date.now() + 60 * 1000); // 60 seconds expiry
    try {
        // Generate QR code data URL (Base64) containing session ID
        const qrCodeBase64 = await qrcode_1.default.toDataURL(qrSessionId);
        // Save to Firestore
        await firebase_1.db.collection('qrSessions').doc(qrSessionId).set({
            qrSessionId,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAtDate),
            ipAddress: req.ip || '0.0.0.0'
        });
        // Write to Realtime Database for instant push updates (< 100ms)
        await firebase_1.rtdb.ref(`qrLive/${qrSessionId}`).set({
            status: 'pending',
            updatedAt: Date.now()
        });
        return res.status(200).json({
            qrSessionId,
            qrCodeBase64,
            expiresAt: expiresAtDate.toISOString()
        });
    }
    catch (err) {
        console.error('Error generating QR challenge:', err);
        return res.status(500).json({ error: 'Internal server error generating QR' });
    }
});
// 6. POST /api/auth/qr/scan (Mobile scans QR, transitions state to scanned)
router.post('/qr/scan', auth_1.requireAuth, async (req, res) => {
    const { qrSessionId } = req.body;
    if (!qrSessionId) {
        return res.status(400).json({ error: 'qrSessionId is required' });
    }
    try {
        const qrDocRef = firebase_1.db.collection('qrSessions').doc(qrSessionId);
        const qrDoc = await qrDocRef.get();
        if (!qrDoc.exists) {
            return res.status(404).json({ error: 'QR Session not found' });
        }
        const qrData = qrDoc.data();
        if (!qrData || qrData.status !== 'pending') {
            return res.status(400).json({ error: 'QR session is no longer pending' });
        }
        const expiresAt = qrData.expiresAt;
        if (expiresAt.toDate() < new Date()) {
            return res.status(400).json({ error: 'QR session has expired' });
        }
        // Update Firestore status to scanned
        await qrDocRef.update({
            status: 'scanned',
            scannedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        // Update Realtime Database status
        await firebase_1.rtdb.ref(`qrLive/${qrSessionId}`).update({
            status: 'scanned',
            updatedAt: Date.now()
        });
        return res.status(200).json({ success: true });
    }
    catch (err) {
        console.error('Error updating QR scan status:', err);
        return res.status(500).json({ error: 'Internal server error during QR scan' });
    }
});
// 7. POST /api/auth/qr/confirm (Mobile approves QR web login request)
router.post('/qr/confirm', auth_1.requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    const { qrSessionId, deviceName, platform } = req.body;
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!qrSessionId) {
        return res.status(400).json({ error: 'qrSessionId is required' });
    }
    try {
        const qrDocRef = firebase_1.db.collection('qrSessions').doc(qrSessionId);
        const qrDoc = await qrDocRef.get();
        if (!qrDoc.exists) {
            return res.status(404).json({ error: 'QR Session not found' });
        }
        const qrData = qrDoc.data();
        if (!qrData || qrData.status !== 'scanned') {
            return res.status(400).json({ error: 'QR session must be scanned before confirmation' });
        }
        const expiresAt = qrData.expiresAt;
        if (expiresAt.toDate() < new Date()) {
            return res.status(400).json({ error: 'QR session has expired' });
        }
        // Create a new web session for this user
        const newSessionId = (0, uuid_1.v4)();
        const webJwt = (0, jwt_1.generateAccessToken)(userId, newSessionId);
        const webRefreshToken = (0, jwt_1.generateRefreshToken)(userId, newSessionId);
        const expiresAtDate = new Date();
        expiresAtDate.setDate(expiresAtDate.getDate() + 30); // 30 days web session expiry
        const session = {
            sessionId: newSessionId,
            userId,
            refreshToken: webRefreshToken,
            deviceName: deviceName || 'Web Browser',
            platform: platform || 'web',
            ipAddress: qrData.ipAddress || '0.0.0.0',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAtDate),
            isActive: true,
        };
        // Save web session to sessions collection and update QR state
        const batch = firebase_1.db.batch();
        batch.set(firebase_1.db.collection('sessions').doc(newSessionId), session);
        batch.update(qrDocRef, {
            status: 'confirmed',
            confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
            jwt: webJwt,
            refreshToken: webRefreshToken,
            sessionId: newSessionId
        });
        await batch.commit();
        // Update Realtime Database to confirmed so web app immediately redirects
        await firebase_1.rtdb.ref(`qrLive/${qrSessionId}`).update({
            status: 'confirmed',
            updatedAt: Date.now()
        });
        return res.status(200).json({ success: true });
    }
    catch (err) {
        console.error('Error confirming QR login:', err);
        return res.status(500).json({ error: 'Internal server error confirming QR' });
    }
});
// 8. POST /api/auth/qr/validate (Web client retrieves tokens once scanned and confirmed)
router.post('/qr/validate', async (req, res) => {
    const { qrSessionId } = req.body;
    if (!qrSessionId) {
        return res.status(400).json({ error: 'qrSessionId is required' });
    }
    try {
        const qrDoc = await firebase_1.db.collection('qrSessions').doc(qrSessionId).get();
        if (!qrDoc.exists) {
            return res.status(404).json({ error: 'QR Session not found' });
        }
        const qrData = qrDoc.data();
        if (!qrData) {
            return res.status(500).json({ error: 'Data not available' });
        }
        // Check expiry
        const expiresAt = qrData.expiresAt;
        if (expiresAt.toDate() < new Date() && qrData.status !== 'confirmed') {
            return res.status(410).json({ error: 'QR Session has expired', status: 'expired' });
        }
        if (qrData.status === 'confirmed') {
            return res.status(200).json({
                jwt: qrData.jwt,
                refreshToken: qrData.refreshToken,
                status: 'confirmed'
            });
        }
        return res.status(200).json({
            status: qrData.status,
            message: 'Pending scanning or confirmation'
        });
    }
    catch (err) {
        console.error('Error validating QR session:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
// 7. POST /api/auth/pin/set (Set a 4-digit PIN for the authenticated user)
router.post('/pin/set', auth_1.requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    const { pin } = req.body;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    if (!pin || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }
    const pinHash = (0, crypto_1.createHash)('sha256').update(pin + userId).digest('hex');
    try {
        // Store PIN hash in the accessKeys doc so we can look up userId by PIN later
        // Also store it on the user doc for reference
        const accessKeyId = Buffer.from(process.env.ACCESS_KEY || 'my-whatsapp-secret-key').toString('base64');
        await firebase_1.db.collection('accessKeys').doc(accessKeyId).update({ pinHash });
        await firebase_1.db.collection('users').doc(userId).update({
            pinSet: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return res.status(200).json({ success: true, message: 'PIN set successfully' });
    }
    catch (err) {
        console.error('Error setting PIN:', err);
        return res.status(500).json({ error: 'Internal server error setting PIN' });
    }
});
// 8. POST /api/auth/pin/login (Login with 4-digit PIN)
router.post('/pin/login', async (req, res) => {
    const { pin, deviceName, platform } = req.body;
    if (!pin || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }
    try {
        // Find the accessKey doc — there's one per access key
        const accessKeyId = Buffer.from(process.env.ACCESS_KEY || 'my-whatsapp-secret-key').toString('base64');
        const accessKeyDoc = await firebase_1.db.collection('accessKeys').doc(accessKeyId).get();
        if (!accessKeyDoc.exists) {
            return res.status(404).json({ error: 'No account found. Please log in with the access key first.' });
        }
        const { userId, pinHash: storedPinHash } = accessKeyDoc.data();
        if (!storedPinHash) {
            return res.status(400).json({ error: 'No PIN has been set for this account. Log in with the access key first.' });
        }
        // Verify PIN
        const inputPinHash = (0, crypto_1.createHash)('sha256').update(pin + userId).digest('hex');
        if (inputPinHash !== storedPinHash) {
            return res.status(401).json({ error: 'Incorrect PIN' });
        }
        // Fetch user data
        const userDoc = await firebase_1.db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User account not found' });
        }
        const userData = userDoc.data();
        // Create new session
        const sessionId = (0, uuid_1.v4)();
        const jwtToken = (0, jwt_1.generateAccessToken)(userId, sessionId);
        const refreshToken = (0, jwt_1.generateRefreshToken)(userId, sessionId);
        const expiresAtDate = new Date();
        expiresAtDate.setDate(expiresAtDate.getDate() + 30);
        await firebase_1.db.collection('sessions').doc(sessionId).set({
            sessionId,
            userId,
            refreshToken,
            deviceName: deviceName || 'Unknown Device',
            platform: platform || 'unknown',
            ipAddress: req.ip || '0.0.0.0',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAtDate),
            isActive: true,
        });
        await firebase_1.db.collection('users').doc(userId).update({
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return res.status(200).json({
            jwt: jwtToken,
            refreshToken,
            user: {
                userId: userData.userId,
                username: userData.username || '',
                name: userData.name,
                about: userData.about,
                profilePhotoUrl: userData.profilePhotoUrl,
            },
        });
    }
    catch (err) {
        console.error('Error during PIN login:', err);
        return res.status(500).json({ error: 'Internal server error during PIN login' });
    }
});
// 9. GET /api/auth/pin/status (Check if PIN is set for the current key)
router.get('/pin/status', async (req, res) => {
    try {
        const accessKeyId = Buffer.from(process.env.ACCESS_KEY || 'my-whatsapp-secret-key').toString('base64');
        const accessKeyDoc = await firebase_1.db.collection('accessKeys').doc(accessKeyId).get();
        if (!accessKeyDoc.exists) {
            return res.status(200).json({ hasAccount: false, hasPIN: false });
        }
        const data = accessKeyDoc.data();
        return res.status(200).json({
            hasAccount: true,
            hasPIN: !!data.pinHash,
        });
    }
    catch (err) {
        console.error('Error checking PIN status:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
