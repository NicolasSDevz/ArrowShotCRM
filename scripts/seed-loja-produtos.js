/**
 * Cria na Loja os produtos que estavam na Kiwify (como rascunho, com a mesma
 * configuração padrão do botão "Novo produto"). Pula os que já existem pelo nome.
 *
 *   node scripts/seed-loja-produtos.js            -> dry-run
 *   node scripts/seed-loja-produtos.js --confirm  -> aplica
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

// [nome, preço em centavos] — "E-book de vendas + Live Gravada" já existia na Loja
const PRODUCTS = [
  ['100 Posts de limpeza para o Instagram', 2700],
  ['Script de vendas para WhatsApp', 2700],
  ['Script de Direct para vender limpeza', 2900],
  ['Treinamento Comercial', 99700],
  ['Análise de Instagram', 4990],
  ['Criação de Logo Marca', 9700],
  ['Deal Shot', 7990],
  ['Consultoria de 45 minutos', 2700],
  ['Roteiro de visita técnica', 9700],
]

function slugify(text) {
  const base = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${base || 'produto'}-${Math.random().toString(36).slice(2, 7)}`
}

const checkout = (headline) => ({
  primaryColor: '#2563eb',
  backgroundColor: '#f1f5f9',
  font: 'Inter',
  headerImageUrl: null,
  headline,
  subheadline: 'Acesso imediato após a confirmação do pagamento.',
  countdown: { enabled: false, minutes: 15, text: 'Oferta por tempo limitado', color: '#e55858' },
  sideImages: [],
  benefits: [],
  testimonials: [],
  guaranteeDays: 7,
  askPhone: true,
  askCpf: false,
  confirmEmail: false,
  buttonText: 'Comprar agora',
  fbPixelId: null,
  thankYouUrl: null,
  footerText: '',
  bumps: [],
})

const members = () => ({
  bannerUrl: null,
  coverUrl: null,
  logoUrl: null,
  primaryColor: '#2563eb',
  welcomeTitle: '',
  welcomeText: '',
  commentsEnabled: true,
  commentsNeedApproval: false,
  certificateEnabled: true,
  producerName: 'Arrow Shot',
})

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
  const adcPath = path.join(os.tmpdir(), `arrowshot-seed-loja-${process.pid}.json`)
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

  const snap = await db.collection('storeProducts').get()
  const existing = new Set(snap.docs.map((d) => String(d.data().name || '').trim().toLowerCase()))
  console.log(`Produtos já na Loja: ${snap.size}`)
  snap.docs.forEach((d) => console.log(`  - ${d.data().name} (${d.data().status})`))

  const todo = PRODUCTS.filter(([name]) => !existing.has(name.toLowerCase()))
  console.log(`\nA criar: ${todo.length}`)
  todo.forEach(([name, price]) => console.log(`  + ${name} — R$ ${(price / 100).toFixed(2).replace('.', ',')}`))
  if (!CONFIRM) return console.log('\nDry-run. Rode com --confirm para criar.')

  const batch = db.batch()
  for (const [name, price] of todo) {
    batch.set(db.collection('storeProducts').doc(), {
      name,
      slug: slugify(name),
      status: 'draft',
      description: '',
      imageUrl: null,
      price,
      comparePrice: null,
      maxInstallments: 12,
      paymentMethods: { pix: true, card: true },
      supportEmail: null,
      statementDescriptor: null,
      testMode: false,
      checkout: checkout(name),
      members: members(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: 'script',
      updatedBy: 'script',
    })
  }
  await batch.commit()
  console.log(`\nCriados ${todo.length} produtos.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
