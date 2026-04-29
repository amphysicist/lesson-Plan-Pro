import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  addDoc, 
  collection, 
  serverTimestamp,
  getDocFromServer,
  query,
  where,
  orderBy,
  getDocs,
  deleteDoc,
  setDoc,
  onSnapshot
} from 'firebase/firestore';
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
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigJSON.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJSON.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJSON.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigJSON.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || firebaseConfigJSON.measurementId,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseConfigJSON.firestoreDatabaseId,
};

const app = initializeApp(firebaseConfig);
// Explicitly use the databaseId from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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
    // Attempt to read a dummy doc from server to verify connectivity
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('offline')) {
      console.error("Firebase is offline. Check your configuration.");
    }
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

export interface FirestoreErrorInfo {
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

function handleFirestoreError(err: any, operationType: FirestoreErrorInfo['operationType'], path: string | null = null): never {
  if (err.code === 'permission-denied') {
    const errorInfo: FirestoreErrorInfo = {
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
    const docRef = await addDoc(collection(db, 'lessonPlans'), {
      form,
      plan,
      authorId: auth.currentUser.uid,
      authorName: auth.currentUser.displayName || "Anonymous",
      createdAt: serverTimestamp()
    });

    return docRef.id;
  } catch (err: any) {
    return handleFirestoreError(err, 'create', 'lessonPlans');
  }
}

export async function archivePlan(form: any, plan: any) {
  if (!auth.currentUser) {
    await signInWithPopup(auth, googleProvider);
  }

  if (!auth.currentUser) throw new Error("Authentication required to archive.");

  try {
    const docRef = await addDoc(collection(db, 'archivedPlans'), {
      form,
      plan,
      authorId: auth.currentUser.uid,
      authorName: auth.currentUser.displayName || "Anonymous",
      createdAt: serverTimestamp()
    });

    return docRef.id;
  } catch (err: any) {
    return handleFirestoreError(err, 'create', 'archivedPlans');
  }
}

export async function getArchivedPlans(): Promise<SharedPlan[]> {
  if (!auth.currentUser) return [];

  try {
    const q = query(
      collection(db, 'archivedPlans'),
      where('authorId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as SharedPlan[];
  } catch (err: any) {
    return handleFirestoreError(err, 'list', 'archivedPlans');
  }
}

export async function deleteArchivedPlan(id: string) {
  if (!auth.currentUser) throw new Error("Auth required");
  try {
    await deleteDoc(doc(db, 'archivedPlans', id));
  } catch (err: any) {
    return handleFirestoreError(err, 'delete', `archivedPlans/${id}`);
  }
}

export async function getSharedPlan(id: string): Promise<SharedPlan | null> {
  const docRef = doc(db, 'lessonPlans', id);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return docSnap.data() as SharedPlan;
  }
  return null;
}

export async function getUserConfig(uid: string): Promise<UserConfig | null> {
  try {
    const docRef = doc(db, 'user_configs', uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as UserConfig;
    }
    return null;
  } catch (err: any) {
    return handleFirestoreError(err, 'get', `user_configs/${uid}`);
  }
}

export async function saveUserConfig(uid: string, config: Partial<UserConfig>) {
  try {
    const docRef = doc(db, 'user_configs', uid);
    await setDoc(docRef, config, { merge: true });
  } catch (err: any) {
    return handleFirestoreError(err, 'update', `user_configs/${uid}`);
  }
}

export async function getAllUserConfigs(): Promise<{ uid: string; config: UserConfig }[]> {
  try {
    const q = query(collection(db, 'user_configs'), orderBy('email', 'asc'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      uid: doc.id,
      config: doc.data() as UserConfig
    }));
  } catch (err: any) {
    return handleFirestoreError(err, 'list', 'user_configs');
  }
}

export function subscribeToUserConfig(uid: string, onUpdate: (config: UserConfig | null) => void) {
  const docRef = doc(db, 'user_configs', uid);
  return onSnapshot(docRef, (doc) => {
    if (doc.exists()) {
      onUpdate(doc.data() as UserConfig);
    } else {
      onUpdate(null);
    }
  }, (err) => {
    handleFirestoreError(err, 'get', `user_configs/${uid}`);
  });
}

