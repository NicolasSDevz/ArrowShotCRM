/**
 * Corrige o campo campaignPlanning.acessos.metaAdsAccountId dos clientes para
 * sempre ter o prefixo "act_" (a plataforma agora adiciona sozinha ao salvar,
 * mas os valores já gravados precisam de um ajuste único).
 *
 * Caso específico do pedido: cliente "Help Gestão e Serviços"
 *   27994847453538948  ->  act_27994847453538948
 *
 *   node scripts/patch-meta-account-id.js            -> dry-run
 *   node scripts/patch-meta-account-id.js --confirm  -> aplica
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

function ensureActPrefix(raw) {
  const v = String(raw ?? '').trim()
  if (!v) return ''
  return /^act_/i.test(v) ? v.replace(/^act_/i, 'act_') : `act_${v}`
}

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

  const snap = await db.collection('clients').get()
  const changes = []
  for (const d of snap.docs) {
    const data = d.data()
    const current = data?.campaignPlanning?.acessos?.metaAdsAccountId
    if (!current) continue
    const fixed = ensureActPrefix(current)
    if (fixed && fixed !== current) {
      changes.push({ ref: d.ref, name: data.companyName ?? d.id, current, fixed })
    }
  }

  if (changes.length === 0) {
    console.log('Nenhum cliente precisa de ajuste — todos os ids já têm o prefixo "act_".')
    return
  }

  console.log(`Clientes a ajustar: ${changes.length}`)
  changes.forEach((c) => console.log(`  - ${c.name}: ${c.current}  ->  ${c.fixed}`))

  if (!CONFIRM) {
    console.log('\ndry-run — rode com --confirm para aplicar.')
    return
  }

  for (let i = 0; i < changes.length; i += 400) {
    const batch = db.batch()
    for (const c of changes.slice(i, i + 400)) {
      batch.update(c.ref, {
        'campaignPlanning.acessos.metaAdsAccountId': c.fixed,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
    await batch.commit()
  }
  console.log(`\n✔ ${changes.length} cliente(s) atualizado(s).`)
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\nFALHOU:', err)
    process.exit(1)
  }
)
