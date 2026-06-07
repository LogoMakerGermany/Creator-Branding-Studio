import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  type Auth,
} from 'firebase/auth';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function readFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  };
}

export function isFirebaseClientConfigured(): boolean {
  const cfg = readFirebaseConfig();
  return Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  if (!isFirebaseClientConfigured()) {
    throw new Error('Firebase ist nicht konfiguriert. VITE_FIREBASE_* Variablen fehlen.');
  }
  app = initializeApp(readFirebaseConfig());
  auth = getAuth(app);
  return auth;
}

export async function firebaseLogin(email: string, password: string): Promise<string> {
  const result = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  return result.user.getIdToken();
}

export async function firebaseRegister(email: string, password: string, name: string): Promise<string> {
  const result = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  if (name.trim()) {
    await updateProfile(result.user, { displayName: name.trim() });
  }
  return result.user.getIdToken();
}

export async function firebaseResetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(getFirebaseAuth(), email);
}

export function getFirebaseConfigError(): string | null {
  if (isFirebaseClientConfigured()) return null;
  return 'Firebase ist nicht konfiguriert. Bitte VITE_FIREBASE_* Variablen setzen und neu deployen.';
}
