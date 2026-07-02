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
// DEBUG FIREBASE CONFIGURATION (SECURE DIAGNOSTIC)
router.get('/debug-firebase', async (req, res) => {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
        return res.status(200).json({ error: 'FIREBASE_SERVICE_ACCOUNT_JSON is missing' });
    }
    try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        const hasPrivateKey = !!serviceAccount.private_key;
        const privateKeyType = typeof serviceAccount.private_key;
        const privateKeyLength = serviceAccount.private_key ? serviceAccount.private_key.length : 0;
        const firstChars = serviceAccount.private_key ? serviceAccount.private_key.slice(0, 30) : '';
        const containsEscapedNewlines = serviceAccount.private_key ? serviceAccount.private_key.includes('\\n') : false;
        const containsRealNewlines = serviceAccount.private_key ? serviceAccount.private_key.includes('\n') : false;
        return res.status(200).json({
            loadedProjectId: admin.app().options.projectId,
            serviceAccountProject: serviceAccount.project_id,
            clientEmail: serviceAccount.client_email,
            hasPrivateKey,
            privateKeyType,
            privateKeyLength,
            firstChars,
            containsEscapedNewlines,
            containsRealNewlines
        });
    }
    catch (err) {
        return res.status(200).json({ error: 'Failed to parse JSON', details: err.message });
    }
});
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
        // Generate Firebase custom token
        let firebaseToken = null;
        try {
            firebaseToken = await admin.auth().createCustomToken(userId);
        }
        catch (e) {
            console.warn('Could not generate Firebase custom token:', e);
        }
        return res.status(200).json({ jwt: newJwtToken, firebaseToken });
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
    // Generate random 8-character code (alphanumeric uppercase)
    const linkCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    try {
        // Generate QR code data URL (Base64) containing session ID
        const qrCodeBase64 = await qrcode_1.default.toDataURL(qrSessionId);
        // Save to Firestore
        await firebase_1.db.collection('qrSessions').doc(qrSessionId).set({
            qrSessionId,
            linkCode,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAtDate),
            ipAddress: req.ip || '0.0.0.0'
        });
        // Write to Realtime Database for instant push updates (< 100ms)
        await firebase_1.rtdb.ref(`qrLive/${qrSessionId}`).set({
            status: 'pending',
            linkCode,
            updatedAt: Date.now()
        });
        return res.status(200).json({
            qrSessionId,
            qrCodeBase64,
            linkCode,
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
// 6b. POST /api/auth/qr/link-code (Mobile submits linkCode to associate session)
router.post('/qr/link-code', auth_1.requireAuth, async (req, res) => {
    const userId = req.user?.userId;
    const { linkCode } = req.body;
    if (!userId)
        return res.status(401).json({ error: 'Unauthorized' });
    if (!linkCode)
        return res.status(400).json({ error: 'Link code is required' });
    try {
        const qrSnap = await firebase_1.db.collection('qrSessions')
            .where('linkCode', '==', linkCode.trim().toUpperCase())
            .where('status', '==', 'pending')
            .limit(1)
            .get();
        if (qrSnap.empty) {
            return res.status(404).json({ error: 'Invalid or expired link code' });
        }
        const qrDoc = qrSnap.docs[0];
        const qrData = qrDoc.data();
        const qrSessionId = qrDoc.id;
        const expiresAt = qrData.expiresAt;
        if (expiresAt.toDate().getTime() < Date.now()) {
            return res.status(400).json({ error: 'Link code has expired' });
        }
        await qrDoc.ref.update({ status: 'scanned', scannedBy: userId });
        await firebase_1.rtdb.ref(`qrLive/${qrSessionId}`).update({ status: 'scanned', scannedBy: userId });
        return res.status(200).json({ qrSessionId, status: 'scanned' });
    }
    catch (err) {
        console.error('Link code verification error:', err);
        return res.status(500).json({ error: 'Internal server error verifying link code' });
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
// ── NEW PRIMARY AUTH FLOW ─────────────────────────────────────────────────────
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
// 10. POST /api/auth/validate-key — Step 1: Check access key is valid
router.post('/validate-key', async (req, res) => {
    const { accessKey } = req.body;
    if (!accessKey)
        return res.status(400).json({ error: 'Access key is required' });
    const correct = process.env.ACCESS_KEY || 'my-whatsapp-secret-key';
    if (accessKey !== correct)
        return res.status(401).json({ error: 'Invalid access key' });
    return res.status(200).json({ valid: true });
});
// 11. POST /api/auth/register — Step 2a: Create new account with username + PIN
router.post('/register', async (req, res) => {
    const { accessKey, username, pin, name, deviceName, platform } = req.body;
    // Validate access key
    const correct = process.env.ACCESS_KEY || 'my-whatsapp-secret-key';
    if (!accessKey || accessKey !== correct) {
        return res.status(401).json({ error: 'Invalid access key' });
    }
    // Validate username
    if (!username || !USERNAME_REGEX.test(username.toLowerCase())) {
        return res.status(400).json({ error: 'Username must be 3–20 chars, lowercase letters, numbers, underscores only' });
    }
    // Validate PIN
    if (!pin || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }
    const normalizedUsername = username.toLowerCase();
    try {
        // Use transaction to guarantee username uniqueness
        const result = await firebase_1.db.runTransaction(async (tx) => {
            const usernameRef = firebase_1.db.collection('usernames').doc(normalizedUsername);
            const usernameSnap = await tx.get(usernameRef);
            if (usernameSnap.exists) {
                const uData = usernameSnap.data();
                const inputPinHash = (0, crypto_1.createHash)('sha256').update(pin + uData.userId).digest('hex');
                if (inputPinHash === uData.pinHash) {
                    throw new Error('SIGN_IN_EXISTING');
                }
                else {
                    throw new Error('USERNAME_TAKEN');
                }
            }
            const userId = (0, uuid_1.v4)();
            const pinHash = (0, crypto_1.createHash)('sha256').update(pin + userId).digest('hex');
            const sessionId = (0, uuid_1.v4)();
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);
            const userDoc = {
                userId,
                username: normalizedUsername,
                name: name || normalizedUsername,
                about: 'Hey there! I am using WhatsApp.',
                profilePhotoUrl: null,
                blockedUserIds: [],
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };
            tx.set(firebase_1.db.collection('users').doc(userId), userDoc);
            tx.set(usernameRef, {
                userId,
                pinHash,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            const jwtToken = (0, jwt_1.generateAccessToken)(userId, sessionId);
            const refreshToken = (0, jwt_1.generateRefreshToken)(userId, sessionId);
            tx.set(firebase_1.db.collection('sessions').doc(sessionId), {
                sessionId,
                userId,
                refreshToken,
                deviceName: deviceName || 'Web Browser',
                platform: platform || 'web',
                ipAddress: req.ip || '0.0.0.0',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
                expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
                isActive: true,
            });
            return { userId, userDoc, jwtToken, refreshToken };
        });
        // Generate Firebase custom token so client can sign in for Firestore access
        let firebaseToken = null;
        try {
            firebaseToken = await admin.auth().createCustomToken(result.userId);
        }
        catch (e) {
            console.warn('Could not generate Firebase custom token:', e);
        }
        return res.status(201).json({
            jwt: result.jwtToken,
            refreshToken: result.refreshToken,
            firebaseToken,
            user: {
                userId: result.userDoc.userId,
                username: result.userDoc.username,
                name: result.userDoc.name,
                about: result.userDoc.about,
                profilePhotoUrl: result.userDoc.profilePhotoUrl,
            },
        });
    }
    catch (err) {
        if (err.message === 'SIGN_IN_EXISTING') {
            try {
                const usernameSnap = await firebase_1.db.collection('usernames').doc(normalizedUsername).get();
                const { userId } = usernameSnap.data();
                const userSnap = await firebase_1.db.collection('users').doc(userId).get();
                const userData = userSnap.data();
                const sessionId = (0, uuid_1.v4)();
                const jwtToken = (0, jwt_1.generateAccessToken)(userId, sessionId);
                const refreshToken = (0, jwt_1.generateRefreshToken)(userId, sessionId);
                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + 30);
                await firebase_1.db.collection('sessions').doc(sessionId).set({
                    sessionId,
                    userId,
                    refreshToken,
                    deviceName: deviceName || 'Web Browser',
                    platform: platform || 'web',
                    ipAddress: req.ip || '0.0.0.0',
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
                    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
                    isActive: true,
                });
                let firebaseToken = null;
                try {
                    firebaseToken = await admin.auth().createCustomToken(userId);
                }
                catch (e) {
                    console.warn('Could not generate Firebase custom token:', e);
                }
                return res.status(200).json({
                    jwt: jwtToken,
                    refreshToken,
                    firebaseToken,
                    user: {
                        userId: userData.userId,
                        username: userData.username,
                        name: userData.name,
                        about: userData.about,
                        profilePhotoUrl: userData.profilePhotoUrl,
                    },
                });
            }
            catch (loginErr) {
                console.error('Error during auto-login:', loginErr);
                return res.status(500).json({ error: 'Internal server error' });
            }
        }
        if (err.message === 'USERNAME_TAKEN') {
            return res.status(409).json({ error: 'Username is already taken' });
        }
        console.error('Register error:', err);
        return res.status(500).json({ error: 'Internal server error during registration' });
    }
});
// 12. POST /api/auth/login-user — Step 2b: Login existing account with username + PIN
router.post('/login-user', async (req, res) => {
    const { accessKey, username, pin, deviceName, platform } = req.body;
    // Validate access key
    const correct = process.env.ACCESS_KEY || 'my-whatsapp-secret-key';
    if (!accessKey || accessKey !== correct) {
        return res.status(401).json({ error: 'Invalid access key' });
    }
    if (!username)
        return res.status(400).json({ error: 'Username is required' });
    if (!pin || !/^\d{4}$/.test(pin))
        return res.status(400).json({ error: 'PIN must be 4 digits' });
    const normalizedUsername = username.toLowerCase();
    try {
        // Look up username
        const usernameSnap = await firebase_1.db.collection('usernames').doc(normalizedUsername).get();
        if (!usernameSnap.exists) {
            return res.status(404).json({ error: 'Username not found' });
        }
        const { userId, pinHash: storedPinHash } = usernameSnap.data();
        // Verify PIN
        const inputPinHash = (0, crypto_1.createHash)('sha256').update(pin + userId).digest('hex');
        if (inputPinHash !== storedPinHash) {
            return res.status(401).json({ error: 'Incorrect PIN' });
        }
        // Fetch user profile
        const userSnap = await firebase_1.db.collection('users').doc(userId).get();
        if (!userSnap.exists) {
            return res.status(404).json({ error: 'User account not found' });
        }
        const userData = userSnap.data();
        // Create new session
        const sessionId = (0, uuid_1.v4)();
        const jwtToken = (0, jwt_1.generateAccessToken)(userId, sessionId);
        const refreshToken = (0, jwt_1.generateRefreshToken)(userId, sessionId);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        await firebase_1.db.collection('sessions').doc(sessionId).set({
            sessionId,
            userId,
            refreshToken,
            deviceName: deviceName || 'Web Browser',
            platform: platform || 'web',
            ipAddress: req.ip || '0.0.0.0',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
            isActive: true,
        });
        await firebase_1.db.collection('users').doc(userId).update({
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Generate Firebase custom token
        let firebaseToken = null;
        try {
            firebaseToken = await admin.auth().createCustomToken(userId);
        }
        catch (e) {
            console.warn('Could not generate Firebase custom token:', e);
        }
        return res.status(200).json({
            jwt: jwtToken,
            refreshToken,
            firebaseToken,
            user: {
                userId: userData.userId,
                username: userData.username,
                name: userData.name,
                about: userData.about,
                profilePhotoUrl: userData.profilePhotoUrl,
            },
        });
    }
    catch (err) {
        console.error('Login-user error:', err);
        return res.status(500).json({ error: 'Internal server error during login' });
    }
});
// 13. GET /api/auth/sessions (Retrieve all active linked web client sessions)
router.get('/sessions', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const sessionsSnap = await firebase_1.db.collection('sessions')
            .where('userId', '==', userId)
            .where('isActive', '==', true)
            .get();
        const now = Date.now();
        const activeSessions = [];
        sessionsSnap.forEach((doc) => {
            const data = doc.data();
            const expiresAtMs = data.expiresAt ? data.expiresAt.toDate().getTime() : 0;
            if (expiresAtMs > now) {
                activeSessions.push({
                    sessionId: data.sessionId,
                    deviceName: data.deviceName,
                    platform: data.platform,
                    ipAddress: data.ipAddress,
                    createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
                    lastActiveAt: data.lastActiveAt ? data.lastActiveAt.toDate().toISOString() : null,
                });
            }
        });
        return res.status(200).json(activeSessions);
    }
    catch (err) {
        console.error('Fetch sessions error:', err);
        return res.status(500).json({ error: 'Internal server error fetching sessions' });
    }
});
// 14. POST /api/auth/sessions/logout (Revoke/log out a specific linked web client session)
router.post('/sessions/logout', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { sessionId } = req.body;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        if (!sessionId)
            return res.status(400).json({ error: 'Session ID is required' });
        const sessionRef = firebase_1.db.collection('sessions').doc(sessionId);
        const sessionSnap = await sessionRef.get();
        if (!sessionSnap.exists) {
            return res.status(404).json({ error: 'Session not found' });
        }
        const sessionData = sessionSnap.data();
        if (sessionData.userId !== userId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        await sessionRef.update({
            isActive: false,
        });
        return res.status(200).json({ success: true, message: 'Session logged out successfully' });
    }
    catch (err) {
        console.error('Logout session error:', err);
        return res.status(500).json({ error: 'Internal server error logging out session' });
    }
});
exports.default = router;
