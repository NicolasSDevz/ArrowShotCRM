// Criptografia simétrica (AES-256-GCM) para os tokens de acesso do Meta Ads
// de cada cliente antes de gravá-los no Firestore. Roda só no servidor.
//
// Chave: variável de ambiente META_TOKEN_ENCRYPTION_KEY no Vercel — 32 bytes
// em base64. Gere uma com:
//
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// Guarde essa chave com o mesmo cuidado de uma senha mestra: qualquer pessoa
// com ela + acesso ao Firestore consegue decifrar os tokens dos clientes.
// Trocar a chave invalida todos os tokens já salvos (seria preciso
// recadastrar). Nunca commite o valor real no repositório.

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'

function loadKey() {
  const raw = process.env.META_TOKEN_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('META_TOKEN_ENCRYPTION_KEY não configurado no servidor')
  }
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('META_TOKEN_ENCRYPTION_KEY inválida — precisa decodificar para exatamente 32 bytes em base64')
  }
  return key
}

/** Cifra um texto (o token em claro) e retorna as partes necessárias para
 *  decifrar depois. Nada disso é o token em claro — seguro para persistir. */
export function encryptToken(plainText) {
  const key = loadKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

/** Decifra o que `encryptToken` produziu, de volta ao token em claro. */
export function decryptToken({ ciphertext, iv, authTag }) {
  const key = loadKey()
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}
