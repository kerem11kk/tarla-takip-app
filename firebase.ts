import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

let app;
let dbInstance: any = null;
let authInstance: any = null;

try {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  
  if (firebaseConfig && firebaseConfig.firestoreDatabaseId) {
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } else {
    dbInstance = getFirestore(app);
  }
  
  // Enable offline persistence
  if (dbInstance) {
    enableIndexedDbPersistence(dbInstance).catch((err) => {
      if (err.code == 'failed-precondition') {
        console.warn('Multiple tabs open, offline persistence disabled for this tab.');
      } else if (err.code == 'unimplemented') {
        console.warn('Browser does not support offline persistence.');
      }
    });
  }
  
  authInstance = getAuth(app);
} catch (error) {
  console.warn("Firebase initialization skipped or failed, running in fallback mode:", error);
}

export const db = dbInstance;
export const auth = authInstance;
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  if (!auth) throw new Error("Firebase Auth kullanılabilir değil");
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
};

export const loginWithEmail = async (email: string, pass: string) => {
  if (!auth) throw new Error("Firebase Auth kullanılabilir değil");
  return signInWithEmailAndPassword(auth, email, pass);
};

export const registerWithEmail = async (email: string, pass: string) => {
  if (!auth) throw new Error("Firebase Auth kullanılabilir değil");
  return createUserWithEmailAndPassword(auth, email, pass);
};

export const logout = async () => {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout failed:", error);
  }
};

