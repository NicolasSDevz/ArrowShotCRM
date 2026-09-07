// Inicialização compartilhada do Firebase Admin SDK para as Vercel
// Functions em /api. Roda só no servidor — nunca é importado pelo
// frontend.
//
// Credenciais: variável de ambiente FIREBASE_SERVICE_ACCOUNT_KEY no Vercel,
// contendo o JSON da service account (Firebase Console → Configurações do
// projeto → Contas de serviço → Gerar nova chave privada), codificado em
// base64 numa linha só:
//
//   base64 -i serviceAccountKey.json | tr -d '\n'
//
// Cole o resultado em Settings → Environment Variables → FIREBASE_SERVICE_ACCOUNT_KEY.
// Nunca commite o JSON da service account no repositório.

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY não configurado no servidor')
  }
  try {
    const jsonStr = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
    return JSON.parse(jsonStr)
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY inválido (esperado JSON da service account, em base64 ou puro)')
  }
}

function getAdminApp() {
  const existing = getApps()
  if (existing.length) return existing[0]
  const serviceAccount = loadServiceAccount()
  return initializeApp({ credential: cert(serviceAccount) })
}

export function adminDb() {
  return getFirestore(getAdminApp())
}

export function adminAuth() {
  return getAuth(getAdminApp())
}
