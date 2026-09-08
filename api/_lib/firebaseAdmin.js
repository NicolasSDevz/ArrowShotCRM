// Acesso ao Firebase (Auth + Firestore) para as Vercel Functions — via REST
// puro + node:crypto, SEM o SDK firebase-admin.
//
// Porquê: firebase-admin declara @google-cloud/firestore e @google-cloud/storage
// como optionalDependencies e puxa gRPC/protobuf. O empacotador das Vercel
// Functions (NFT) não inclui esses arquivos de forma confiável, então
// `import 'firebase-admin/firestore'` quebra no cold start (FUNCTION_INVOCATION_FAILED).
// Aqui não há dependência nativa nenhuma.
//
// Credenciais: FIREBASE_SERVICE_ACCOUNT_KEY (JSON da service account, base64 ou
// puro) — Firebase Console → Configurações do projeto → Contas de serviço →
// Gerar nova chave privada. Nunca commitar o valor.

import { createSign, createVerify, createPublicKey } from 'node:crypto'

const PROJECT_ID = 'arrowshotcrm'
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'

/* ------------------------------------------------------------------ */
/* Service account + OAuth2 access token (JWT bearer grant)            */
/* ------------------------------------------------------------------ */

function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY não configurado no servidor')
  let json
  try {
    const str = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
    json = JSON.parse(str)
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY inválido (esperado JSON da service account, em base64 ou puro)')
  }
  if (!json.client_email || !json.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY sem client_email/private_key')
  }
  return json
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let cachedAccessToken = null // { token, exp }

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000)
  if (cachedAccessToken && cachedAccessToken.exp - 60 > now) return cachedAccessToken.token

  const sa = loadServiceAccount()
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  )
  const signature = base64url(createSign('RSA-SHA256').update(`${header}.${claim}`).sign(sa.private_key))
  const assertion = `${header}.${claim}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Falha ao autenticar a service account: ${data.error_description || data.error || res.status}`)
  }
  cachedAccessToken = { token: data.access_token, exp: now + (data.expires_in || 3600) }
  return cachedAccessToken.token
}

/* ------------------------------------------------------------------ */
/* Firestore REST — conversão de/para o formato "Value" da API         */
/* ------------------------------------------------------------------ */

function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } }
  if (typeof v === 'object') return { mapValue: { fields: toFields(v) } }
  return { stringValue: String(v) }
}

function toFields(obj) {
  const out = {}
  for (const [k, val] of Object.entries(obj)) out[k] = toValue(val)
  return out
}

function fromValue(val) {
  if (!val || typeof val !== 'object') return undefined
  if ('nullValue' in val) return null
  if ('stringValue' in val) return val.stringValue
  if ('booleanValue' in val) return val.booleanValue
  if ('integerValue' in val) return Number(val.integerValue)
  if ('doubleValue' in val) return val.doubleValue
  if ('timestampValue' in val) return val.timestampValue
  if ('arrayValue' in val) return (val.arrayValue.values || []).map(fromValue)
  if ('mapValue' in val) return fromFields(val.mapValue.fields || {})
  return undefined
}

function fromFields(fields) {
  const out = {}
  for (const [k, val] of Object.entries(fields)) out[k] = fromValue(val)
  return out
}

/** Lê um documento. Retorna { exists, data() } no estilo do Admin SDK. */
export async function getDoc(path) {
  const token = await getAccessToken()
  const res = await fetch(`${FS_BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 404) return { exists: false, data: () => undefined }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Firestore GET ${path}: ${body?.error?.message || res.status}`)
  return { exists: true, data: () => fromFields(body.fields || {}) }
}

/** Grava (substitui todos os campos de) um documento; cria se não existir. */
export async function setDoc(path, data) {
  const token = await getAccessToken()
  const res = await fetch(`${FS_BASE}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(data) }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Firestore PATCH ${path}: ${body?.error?.message || res.status}`)
}

/** Apaga um documento (404 é tratado como sucesso). */
export async function deleteDoc(path) {
  const token = await getAccessToken()
  const res = await fetch(`${FS_BASE}/${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok && res.status !== 404) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Firestore DELETE ${path}: ${body?.error?.message || res.status}`)
  }
}

/* ------------------------------------------------------------------ */
/* Verificação de Firebase ID token (RS256, chaves públicas do Google) */
/* ------------------------------------------------------------------ */

let cachedCerts = null // { certs, exp }

async function getFirebaseCerts() {
  if (cachedCerts && cachedCerts.exp > Date.now()) return cachedCerts.certs
  const res = await fetch(CERTS_URL)
  if (!res.ok) throw new Error('Falha ao buscar as chaves públicas do Firebase')
  const certs = await res.json()
  const maxAge = Number((String(res.headers.get('cache-control') || '').match(/max-age=(\d+)/) || [])[1] || 3600)
  cachedCerts = { certs, exp: Date.now() + maxAge * 1000 }
  return certs
}

function decodeSegment(seg) {
  return JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
}

/** Verifica um Firebase ID token e devolve { uid, email }. Lança se inválido. */
export async function verifyIdToken(idToken) {
  const parts = String(idToken).split('.')
  if (parts.length !== 3) throw new Error('ID token malformado')
  const [headerB64, payloadB64, sigB64] = parts

  const header = decodeSegment(headerB64)
  const payload = decodeSegment(payloadB64)
  if (header.alg !== 'RS256') throw new Error('ID token: algoritmo inesperado')

  const certs = await getFirebaseCerts()
  const pem = certs[header.kid]
  if (!pem) throw new Error('ID token: kid desconhecido')

  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${headerB64}.${payloadB64}`)
  const sig = Buffer.from(sigB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  if (!verifier.verify(createPublicKey(pem), sig)) throw new Error('ID token: assinatura inválida')

  const now = Math.floor(Date.now() / 1000)
  if (payload.aud !== PROJECT_ID) throw new Error('ID token: aud incorreto')
  if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) throw new Error('ID token: iss incorreto')
  if (!payload.sub) throw new Error('ID token: sub ausente')
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('ID token expirado')
  if (typeof payload.iat === 'number' && payload.iat > now + 300) throw new Error('ID token: iat no futuro')

  return { uid: payload.sub, email: payload.email || null }
}
