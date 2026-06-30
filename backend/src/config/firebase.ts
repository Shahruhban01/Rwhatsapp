import * as admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

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
  } else {
    console.log('Initializing Firebase Admin SDK in Production mode...');
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
      try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: process.env.FIREBASE_DATABASE_URL,
        });
      } catch (err) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON. Falling back to application default credentials.', err);
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          databaseURL: process.env.FIREBASE_DATABASE_URL,
        });
      }
    } else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
    }
  }
}

export const db = admin.firestore();
export const rtdb = admin.database();
export const auth = admin.auth();
export const messaging = admin.messaging();

export default admin;
