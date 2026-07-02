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
exports.messaging = exports.auth = exports.rtdb = exports.db = void 0;
const admin = __importStar(require("firebase-admin"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Determine if we should use emulators (default for development)
const isEmulator = process.env.NODE_ENV === 'development' || !!process.env.FIRESTORE_EMULATOR_HOST;
if (admin.apps.length === 0) {
    if (isEmulator) {
        console.log('Initializing Firebase Admin SDK in Local Emulator mode...');
        // Set emulator host variables if they aren't already set
        if (!process.env.FIRESTORE_EMULATOR_HOST) {
            process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
        }
        if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
            process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
        }
        if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
            process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
        }
        const projectId = process.env.FIREBASE_PROJECT_ID || 'whatsapp-clone-dev';
        admin.initializeApp({
            projectId: projectId,
            databaseURL: `http://127.0.0.1:9000?ns=${projectId}`,
        });
    }
    else {
        console.log('Initializing Firebase Admin SDK in Production mode...');
        const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (serviceAccountJson) {
            try {
                const serviceAccount = JSON.parse(serviceAccountJson);
                if (serviceAccount.private_key) {
                    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
                }
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    databaseURL: process.env.FIREBASE_DATABASE_URL,
                });
            }
            catch (err) {
                console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON. Falling back to application default credentials.', err);
                admin.initializeApp({
                    credential: admin.credential.applicationDefault(),
                    databaseURL: process.env.FIREBASE_DATABASE_URL,
                });
            }
        }
        else {
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
                databaseURL: process.env.FIREBASE_DATABASE_URL,
            });
        }
    }
}
exports.db = admin.firestore();
exports.rtdb = admin.database();
exports.auth = admin.auth();
exports.messaging = admin.messaging();
exports.default = admin;
