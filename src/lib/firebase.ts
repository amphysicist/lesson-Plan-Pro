import { initializeApp } from 'firebase/app';
import { 
  getDatabase, 
  ref, 
  set, 
  get, 
  push, 
  remove, 
  update, 
  onValue, 
  query, 
  orderByChild, 
  equalTo,
  serverTimestamp
} from 'firebase/database';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail
} from 'firebase/auth';
import firebaseConfigJSON from '../../firebase-applet-config.json';
import { UserConfig } from '../types';

// Use environment variables if available (prefixed with VITE_ for client-side Vite)
// otherwise fallback to the JSON config file.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigJSON.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigJSON.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ai-studio-applet-webapp-75c21',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJSON.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJSON.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigJSON.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfigJSON.measurementId,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || `https://ai-studio-applet-webapp-75c21-default-rtdb.asia-southeast1.firebasedatabase.app`,
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
export { 
  onAuthStateChanged, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  updateProfile,
  signInWithPopup,
  sendPasswordResetEmail
};
export const googleProvider = new GoogleAuthProvider();

export async function testConnection() {
  try {
    const connectedRef = ref(db, ".info/connected");
    onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        console.log("Connected to Realtime Database");
      } else {
        console.warn("Disconnected from Realtime Database");
      }
    });
  } catch (error) {
    console.error("Firebase connection test failed:", error);
  }
}

export interface SharedPlan {
  id?: string;
  form: any;
  plan: any;
  authorId: string;
  authorName: string;
  createdAt: any;
}

export interface FirebaseErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}

function handleFirebaseError(err: any, operationType: FirebaseErrorInfo['operationType'], path: string | null = null): never {
  if (err.code === 'PERMISSION_DENIED') {
    const errorInfo: FirebaseErrorInfo = {
      error: err.message,
      operationType,
      path,
      authInfo: {
        userId: auth.currentUser?.uid || 'none',
        email: auth.currentUser?.email || 'none',
        emailVerified: auth.currentUser?.emailVerified || false,
        isAnonymous: auth.currentUser?.isAnonymous || false,
        providerInfo: auth.currentUser?.providerData.map(p => ({
          providerId: p.providerId,
          displayName: p.displayName || '',
          email: p.email || '',
        })) || [],
      }
    };
    throw new Error(JSON.stringify(errorInfo));
  }
  throw err;
}

export async function sharePlan(form: any, plan: any) {
  if (!auth.currentUser) {
    await signInWithPopup(auth, googleProvider);
  }

  if (!auth.currentUser) throw new Error("Authentication required to share.");

  try {
    const plansRef = ref(db, 'lessonPlans');
    const newPlanRef = push(plansRef);
    await set(newPlanRef, {
      form,
      plan,
      authorId: auth.currentUser.uid,
      authorName: auth.currentUser.displayName || "Anonymous",
      createdAt: serverTimestamp()
    });

    return newPlanRef.key;
  } catch (err: any) {
    return handleFirebaseError(err, 'create', 'lessonPlans');
  }
}

export async function archivePlan(form: any, plan: any) {
  if (!auth.currentUser) {
    await signInWithPopup(auth, googleProvider);
  }

  if (!auth.currentUser) throw new Error("Authentication required to archive.");

  try {
    const archivesRef = ref(db, 'archivedPlans');
    const newArchiveRef = push(archivesRef);
    await set(newArchiveRef, {
      form,
      plan,
      authorId: auth.currentUser.uid,
      authorName: auth.currentUser.displayName || "Anonymous",
      createdAt: serverTimestamp()
    });

    return newArchiveRef.key;
  } catch (err: any) {
    return handleFirebaseError(err, 'create', 'archivedPlans');
  }
}

export async function getArchivedPlans(): Promise<SharedPlan[]> {
  if (!auth.currentUser) return [];

  try {
    const archivesRef = ref(db, 'archivedPlans');
    const q = query(archivesRef, orderByChild('authorId'), equalTo(auth.currentUser.uid));
    const snapshot = await get(q);
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      const plans = Object.keys(data).map(key => ({
        id: key,
        ...data[key]
      }));
      // Sort by createdAt desc manually if needed, or rely on another query if possible.
      // RTDB queries only support one orderBy.
      return plans.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) as SharedPlan[];
    }
    return [];
  } catch (err: any) {
    return handleFirebaseError(err, 'list', 'archivedPlans');
  }
}

export async function deleteArchivedPlan(id: string) {
  if (!auth.currentUser) throw new Error("Auth required");
  try {
    await remove(ref(db, `archivedPlans/${id}`));
  } catch (err: any) {
    return handleFirebaseError(err, 'delete', `archivedPlans/${id}`);
  }
}

export async function getSharedPlan(id: string): Promise<SharedPlan | null> {
  try {
    const snapshot = await get(ref(db, `lessonPlans/${id}`));
    if (snapshot.exists()) {
      return snapshot.val() as SharedPlan;
    }
    return null;
  } catch (err: any) {
    return handleFirebaseError(err, 'get', `lessonPlans/${id}`);
  }
}

export async function getUserConfig(uid: string): Promise<UserConfig | null> {
  try {
    const snapshot = await get(ref(db, `user_configs/${uid}`));
    if (snapshot.exists()) {
      return snapshot.val() as UserConfig;
    }
    return null;
  } catch (err: any) {
    return handleFirebaseError(err, 'get', `user_configs/${uid}`);
  }
}

export async function saveUserConfig(uid: string, config: Partial<UserConfig>) {
  try {
    const configRef = ref(db, `user_configs/${uid}`);
    await update(configRef, config);
  } catch (err: any) {
    return handleFirebaseError(err, 'update', `user_configs/${uid}`);
  }
}

export async function getAllUserConfigs(): Promise<{ uid: string; config: UserConfig }[]> {
  try {
    const configRef = ref(db, 'user_configs');
    let snapshot;
    try {
      // Try ordered query first
      const q = query(configRef, orderByChild('email'));
      snapshot = await get(q);
    } catch (queryErr) {
      console.warn("Ordered query failed, falling back to plain get:", queryErr);
      snapshot = await get(configRef);
    }
    
    if (snapshot.exists()) {
      const results: { uid: string; config: UserConfig }[] = [];
      snapshot.forEach((child) => {
        results.push({
          uid: child.key!,
          config: child.val() as UserConfig
        });
      });
      return results;
    }
    return [];
  } catch (err: any) {
    console.error("Admin fetch error:", err);
    return handleFirebaseError(err, 'list', 'user_configs');
  }
}

export function subscribeToUserConfig(uid: string, onUpdate: (config: UserConfig | null) => void) {
  const configRef = ref(db, `user_configs/${uid}`);
  return onValue(configRef, (snapshot) => {
    if (snapshot.exists()) {
      onUpdate(snapshot.val() as UserConfig);
    } else {
      onUpdate(null);
    }
  }, (err) => {
    handleFirebaseError(err, 'get', `user_configs/${uid}`);
  });
}

