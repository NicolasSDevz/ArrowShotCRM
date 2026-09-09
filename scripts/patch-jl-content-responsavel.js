/**
 * Reatribui os conteúdos do cliente "JL Limpeza" de Nicolas para Ciane —
 * JL é cliente da Ciane; o calendário editorial foi gerado/importado com o
 * responsável errado.
 *
 *   node scripts/patch-jl-content-responsavel.js            -> dry-run
 *   node scripts/patch-jl-content-responsavel.js --confirm  -> aplica
 *
 * Auth: reutiliza o login do Firebase CLI (igual seed-clientes.js).
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const PROJECT_ID = 'arrowshotcrm'
const CONFIRM = process.argv.includes('--confirm')
const CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

const JL_CLIENT_ID = 'D7bPZ90yxuSMbbL5yRjp' // JL Limpeza
const NICOLAS = 'mQT9UqcluUO2F8yxIZiU6EIZ6Sp1'
const CIANE = 'vYRfizstRZhGsPEjGxxUGg3OJEk2'

function firebaseCliRefreshToken() {
  const candidates = [
    path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'configstore', 'firebase-tools.json'),
  ].filter(Boolean)
  for (const p of candidates) {
    try {
      const rt = JSON.parse(fs.readFileSync(p, 'utf8'))?.tokens?.refresh_token
      if (rt) return rt
    } catch {
      /* próximo */
    }
  }
  throw new Error('Login do Firebase CLI não encontrado. Rode `firebase login`.')
}

async function main() {
  const rt = firebaseCliRefreshToken()
  const adcPath = path.join(os.tmpdir(), `arrowshot-jl-${process.pid}.json`)
  fs.writeFileSync(
    adcPath,
    JSON.stringify({ type: 'authorized_user', client_id: CLI_CLIENT_ID, client_secret: CLI_CLIENT_SECRET, refresh_token: rt })
  )
  process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath
  process.on('exit', () => {
    try {
      fs.unlinkSync(adcPath)
    } catch {
      /* ignore */
    }
  })

  initializeApp({ projectId: PROJECT_ID, credential: applicationDefault() })
  const db = getFirestore()

  const snap = await db.collection('contents').where('clientId', '==', JL_CLIENT_ID).get()
  const targets = snap.docs.filter((d) => d.data().assignedTo === NICOLAS)

  console.log(`Conteúdos de JL Limpeza: ${snap.size}`)
  console.log(`Atribuídos ao Nicolas (serão movidos p/ Ciane): ${targets.length}`)
  targets.slice(0, 8).forEach((d) => console.log(`  - ${d.data().title}`))
  if (targets.length > 8) console.log(`  … e mais ${targets.length - 8}`)

  if (targets.length === 0) {
    console.log('\nNada a fazer.')
    return
  }
  if (!CONFIRM) {
    console.log('\ndry-run — rode com --confirm para aplicar.')
    return
  }

  let done = 0
  for (let i = 0; i < targets.length; i += 400) {
    const batch = db.batch()
    for (const d of targets.slice(i, i + 400)) {
      batch.update(d.ref, { assignedTo: CIANE, updatedAt: FieldValue.serverTimestamp() })
      done++
    }
    await batch.commit()
  }

  // garante Ciane como responsável do cliente (já costuma estar em ownerIds)
  await db.collection('clients').doc(JL_CLIENT_ID).update({
    ownerIds: FieldValue.arrayUnion(CIANE),
    updatedAt: FieldValue.serverTimestamp(),
  })

  console.log(`\n✔ ${done} conteúdo(s) reatribuído(s) para Ciane.`)
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\nFALHOU:', err)
    process.exit(1)
  }
)
