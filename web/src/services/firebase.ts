import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { getAuth, connectAuthEmulator } from 'firebase/auth';

// Use dummy config for emulator suite during development
const firebaseConfig = {
  apiKey: "dummy-api-key-for-emulator",
  authDomain: "ruhbans-whatsapp.firebaseapp.com",
  databaseURL: "http://127.0.0.1:9000?ns=ruhbans-whatsapp",
  projectId: "ruhbans-whatsapp",
  storageBucket: "ruhbans-whatsapp.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:1234567890"
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
