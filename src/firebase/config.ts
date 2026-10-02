import { initializeApp, getApps } from 'firebase/app'
import { browserLocalPersistence, getAuth, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth'
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

// Login guardado no localStorage, não no IndexedDB (padrão do getAuth).
// Com o IndexedDB, o Firebase relê o banco a cada ~800 ms e, se a leitura
// volta vazia (extensão/limpador apagando o IndexedDB, banco recriado pelo
// navegador), desloga a aba na hora — era o aviso "live-removed", com o
// localStorage do CRM intacto. O IndexedDB fica como reserva e, na primeira
// carga, o Firebase migra sozinho o login que já estava lá (ninguém cai).
function initAuth(): Auth {
  try {
    return initializeAuth(app, { persistence: [browserLocalPersistence, indexedDBLocalPersistence] })
  } catch {
    return getAuth(app) // já inicializado (HMR em dev)
  }
}

export const auth = initAuth()

// Offline persistence with multi-tab support keeps board/list views usable on
// flaky connections and avoids "missing index" surprises during dev reloads.
// ignoreUndefinedProperties: forms across the app send `undefined` for empty
// optional fields (e.g. a client with no Instagram) — Firestore rejects that
// by default, so this tells the SDK to just drop those keys instead of throwing.
// experimentalForceLongPolling: a conexão em streaming padrão (WebChannel)
// era derrubada sem parar por antivírus/extensões no navegador de alguns
// usuários ("AbortError: signal is aborted" em loop e queda de sessão);
// long polling usa requisições HTTP comuns, que passam por esses filtros.
// Falls back to memory cache where persistence can't init (private browsing,
// storage disabled) so the app still boots.
function initDb(): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
      experimentalForceLongPolling: true,
    })
  } catch (err) {
    console.warn('Persistência offline indisponível — usando cache em memória.', err)
    return initializeFirestore(app, { ignoreUndefinedProperties: true, experimentalForceLongPolling: true })
  }
}

export const db = initDb()

export const storage = getStorage(app)
