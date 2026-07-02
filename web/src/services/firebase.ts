import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

// Use dummy config for emulator suite during development
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "dummy-api-key-for-emulator",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "ruhbans-whatsapp.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "http://127.0.0.1:9000?ns=ruhbans-whatsapp",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "ruhbans-whatsapp",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "ruhbans-whatsapp.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1234567890:web:1234567890"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const auth = getAuth(app);

// Connect to emulators if in development
if (import.meta.env.DEV) {
  console.log("Connecting to Firebase Emulators...");
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectDatabaseEmulator(rtdb, "127.0.0.1", 9000);
}
