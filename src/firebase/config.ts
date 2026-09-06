import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error(
    'Firebase env vars ausentes. Copie .env.example para .env.local e preencha com os dados do seu projeto Firebase.'
  )
}

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)

export const auth = getAuth(app)

// Offline persistence with multi-tab support keeps board/list views usable on
// flaky connections and avoids "missing index" surprises during dev reloads.
// ignoreUndefinedProperties: forms across the app send `undefined` for empty
// optional fields (e.g. a client with no Instagram) — Firestore rejects that
// by default, so this tells the SDK to just drop those keys instead of throwing.
// Falls back to memory cache where persistence can't init (private browsing,
// storage disabled) so the app still boots.
function initDb(): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    })
  } catch (err) {
    console.warn('Persistência offline indisponível — usando cache em memória.', err)
    return initializeFirestore(app, { ignoreUndefinedProperties: true })
  }
}

export const db = initDb()

export const storage = getStorage(app)
