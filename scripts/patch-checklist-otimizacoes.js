/**
 * Parte 4 do módulo de Otimizações: troca o checklist das tarefas recorrentes
 * "Gestor de Tráfego — Semanal — *" que já existem no Firebase pelos itens
 * novos (os antigos genéricos não têm correspondência 1-a-1, então são
 * substituídos por itens frescos, desmarcados).
 *
 *   node scripts/patch-checklist-otimizacoes.js            -> dry-run
 *   node scripts/patch-checklist-otimizacoes.js --confirm  -> aplica
 *
 * Auth: reutiliza o login do Firebase CLI (igual seed-clientes.js).
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const PROJECT_ID = 'arrowshotcrm'
const CONFIRM = process.argv.includes('--confirm')
const CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

const NEW_CHECKLIST = [
  'Registrar otimização Meta Ads (ver aba Otimizações)',
  'Registrar otimização Google Ads (ver aba Otimizações)',
  'Verificar saldo nas plataformas',
  'Enviar relatório semanal (toda segunda)',
  'Solicitar novos criativos se necessário',
]

const TITLE_PREFIX = 'Gestor de Tráfego — Semanal'

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
  const adcPath = path.join(os.tmpdir(), `arrowshot-patch-adc-${process.pid}.json`)
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

  const snap = await db.collection('tasks').get()
  const targets = snap.docs.filter((d) => String(d.data().title ?? '').startsWith(TITLE_PREFIX))

  console.log(`Tarefas "${TITLE_PREFIX} — *" encontradas: ${targets.length}`)
  targets.slice(0, 5).forEach((d) => console.log(`  - ${d.data().title}`))
  if (targets.length > 5) console.log(`  … e mais ${targets.length - 5}`)

  if (!CONFIRM) {
    console.log('\ndry-run — rode com --confirm para trocar o checklist dessas tarefas.')
    return
  }

  let done = 0
  for (let i = 0; i < targets.length; i += 400) {
    const batch = db.batch()
    for (const d of targets.slice(i, i + 400)) {
      batch.update(d.ref, {
        checklist: NEW_CHECKLIST.map((text) => ({ id: randomUUID(), text, done: false })),
        updatedAt: FieldValue.serverTimestamp(),
      })
      done++
    }
    await batch.commit()
  }
  console.log(`\n✔ Checklist atualizado em ${done} tarefas.`)
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\nFALHOU:', err)
    process.exit(1)
  }
)
