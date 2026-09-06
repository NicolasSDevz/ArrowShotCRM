/**
 * Seed dos clientes reais da Arrow Shot.
 *
 *   node scripts/seed-clientes.js            -> dry-run: só mostra o que faria
 *   node scripts/seed-clientes.js --confirm  -> APAGA clientes/tarefas de teste
 *                                               e cria os 22 clientes + tarefas
 *
 * Autenticação: reutiliza o login do Firebase CLI já feito nesta máquina
 * (`firebase login`). Nenhuma credencial é digitada ou salva por aqui.
 *
 * O que é apagado: todos os docs de `clients` e todos os docs de `tasks`,
 * `contents`, `meetings`, `calendarEvents`, `reports`, `approvals` que
 * referenciam um cliente (clientId). NÃO toca em `users`, `teamMembers`,
 * `notifications`, universidade, etc.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const PROJECT_ID = 'arrowshotcrm'
const CONFIRM = process.argv.includes('--confirm')

// OAuth client público do firebase-tools (não é segredo — cliente "desktop").
const CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

function firebaseCliRefreshToken() {
  const candidates = [
    path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'configstore', 'firebase-tools.json'),
    process.env.XDG_CONFIG_HOME && path.join(process.env.XDG_CONFIG_HOME, 'configstore', 'firebase-tools.json'),
  ].filter(Boolean)
  for (const p of candidates) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'))
      const rt = data?.tokens?.refresh_token
      if (rt) return { rt, email: data?.user?.email, path: p }
    } catch {
      /* próximo candidato */
    }
  }
  throw new Error(
    'Não achei o login do Firebase CLI. Rode `firebase login` nesta máquina e tente de novo.'
  )
}

/* ----------------------------- dados ----------------------------- */

const CLIENTS = [
  { name: 'Adamax', cat: 'B', resp: ['Nicolas', 'Janilson', 'Bruno'] },
  { name: 'Caiçara Nord', cat: 'B', resp: ['Ciane', 'Nicolas', 'Janilson', 'Bruno'] },
  { name: 'Capricho', cat: 'A', resp: ['Ciane', 'Nicolas', 'Janilson', 'Bruno'] },
  { name: 'CasaClean', cat: 'A', resp: ['Ciane', 'Nicolas', 'Janilson', 'Bruno'] },
  { name: 'Celso Pisos', cat: 'B', resp: ['Ciane', 'Nicolas', 'Janilson', 'Bruno'] },
  { name: 'Clean SE', cat: 'A', resp: ['Ciane', 'Bruno'] },
  { name: 'ConSeven', cat: 'A', resp: ['Ciane', 'Nicolas', 'Bruno'] },
  { name: 'Constru Clear', cat: 'A', resp: ['Ciane', 'Nicolas', 'Janilson', 'Bruno'] },
  { name: 'Decoralar', cat: 'B', resp: ['Ciane', 'Bruno'] },
  { name: 'Dona Help', cat: 'A', resp: ['Ciane', 'Bruno'] },
  { name: 'Fenix', cat: 'B', resp: ['Ciane', 'Nicolas', 'Janilson', 'Bruno'] },
  { name: 'Help Gestão e Serviços', cat: 'A', resp: ['Ciane', 'Nicolas', 'Janilson', 'Bruno'] },
  { name: 'JL Limpeza', cat: 'B', resp: ['Ciane', 'Nicolas', 'Janilson', 'Bruno'] },
  { name: 'Kapta Services', cat: 'A', resp: ['Ciane', 'Nicolas', 'Janilson', 'Bruno'] },
  { name: 'LimpeCenter', cat: 'B', resp: ['Ciane', 'Nicolas', 'Janilson', 'Bruno'] },
  { name: 'MNK', cat: 'B', resp: ['Ciane', 'Nicolas', 'Bruno'] },
  { name: 'Multi Limpeza', cat: 'A', resp: ['Ciane', 'Nicolas', 'Janilson', 'Bruno'] },
  { name: 'RR Limpezas', cat: 'B', resp: ['Ciane', 'Nicolas', 'Janilson', 'Bruno'] },
  { name: 'Rennova Clean', cat: 'B', resp: ['Ciane', 'Nicolas', 'Janilson', 'Bruno'] },
  { name: 'TM Clean', cat: 'A', resp: ['Nicolas', 'Bruno'] },
  { name: 'Uniclean', cat: 'A', resp: ['Nicolas', 'Janilson', 'Bruno'] },
  { name: 'WA Facilities', cat: 'A', resp: ['Ciane', 'Nicolas', 'Bruno'] },
]

const RECURRING_DESC =
  'Tarefa recorrente. Ao concluir, use "Duplicar próxima ocorrência" no card para recriá-la.'

// who: 'trafego' -> Nicolas se ele for responsável do cliente, senão Ciane.
//      'cs'      -> Janilson.
const TASK_TEMPLATES = [
  {
    title: 'Gestor de Tráfego — Semanal',
    who: 'trafego',
    recurrence: { frequency: 'weekly', weekday: 1 }, // toda segunda
    checklist: [
      'Estudar melhorias',
      'Otimização Google',
      'Otimização Facebook',
      'Verificar saldo nas plataformas',
      'Conferência na funcionalidade do site',
      'Revisão da planilha de melhoria contínua',
      'Solicitar novos criativos',
      'Revisar contas de anúncios',
      'Envio de Relatório Semanal (toda segunda)',
    ],
  },
  {
    title: 'Gestor de Tráfego — Mensal',
    who: 'trafego',
    recurrence: { frequency: 'monthly', dayOfMonth: 1 },
    checklist: [
      'Atualização de públicos (cada 3 meses)',
      'Reunião com consultor Google',
      'Reunião com consultor Facebook',
      'Atualizar relatórios no Reportei',
      'Preenchimento da planilha de seguidores',
      'Atualizar planilha de investimento',
      'Envio de boletos das plataformas',
    ],
  },
  {
    title: 'CS — Semanal',
    who: 'cs',
    recurrence: { frequency: 'weekly', weekday: 5 }, // toda sexta
    checklist: [
      'Melhoria Contínua',
      'Fazer o consolidado',
      'Acompanhamento de Faturamento',
      'Verificar mensagens sem resposta nos grupos',
    ],
  },
  {
    title: 'CS — Mensal',
    who: 'cs',
    recurrence: { frequency: 'monthly', dayOfMonth: 1 },
    checklist: [
      'Agendar as Consultorias',
      'Pedir Indicações',
      'Pesquisa de NPS',
      'Preencher o Dashboard',
      'Preparar as Consultorias',
      'Mensagem a cada 15 dias para o cliente',
      'Enviar relatório mensal',
    ],
  },
]

// Nome na plataforma -> pedaços de nome que casam no doc de users/teamMembers.
const PEOPLE_ALIASES = {
  Ciane: ['ciane'],
  Nicolas: ['nicolas', 'nícolas'],
  Bruno: ['bruno'],
  Janilson: ['janilson', 'jamilson'],
}

/* --------------------------- helpers ---------------------------- */

function matchPerson(name, docs) {
  const needles = PEOPLE_ALIASES[name] ?? [name.toLowerCase()]
  return docs.find((d) => {
    const dn = String(d.data.name ?? '').toLowerCase()
    return needles.some((n) => dn.includes(n))
  })
}

async function deleteInChunks(db, refs) {
  const CHUNK = 400
  let done = 0
  for (let i = 0; i < refs.length; i += CHUNK) {
    const batch = db.batch()
    for (const ref of refs.slice(i, i + CHUNK)) batch.delete(ref)
    await batch.commit()
    done += Math.min(CHUNK, refs.length - i)
  }
  return done
}

/* ----------------------------- main ----------------------------- */

async function main() {
  const { rt, email, path: cfgPath } = firebaseCliRefreshToken()
  console.log(`Autenticado como ${email} (${cfgPath})`)
  console.log(`Projeto: ${PROJECT_ID}`)
  console.log(CONFIRM ? '\n>>> MODO CONFIRMADO — vai apagar e recriar dados <<<\n' : '\n(dry-run — nada será alterado; use --confirm para executar)\n')

  // firebase-admin v14 só aceita service account ou ADC para o Firestore.
  // Escrevemos um ADC "authorized_user" temporário com o token do CLI e
  // apontamos GOOGLE_APPLICATION_CREDENTIALS para ele (removido ao sair).
  const adcPath = path.join(os.tmpdir(), `arrowshot-seed-adc-${process.pid}.json`)
  fs.writeFileSync(
    adcPath,
    JSON.stringify({
      type: 'authorized_user',
      client_id: CLI_CLIENT_ID,
      client_secret: CLI_CLIENT_SECRET,
      refresh_token: rt,
    })
  )
  process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath
  const cleanupAdc = () => {
    try {
      fs.unlinkSync(adcPath)
    } catch {
      /* ignore */
    }
  }
  process.on('exit', cleanupAdc)

  initializeApp({ projectId: PROJECT_ID, credential: applicationDefault() })
  const db = getFirestore()

  /* ---- resolver pessoas ---- */
  const [usersSnap, membersSnap] = await Promise.all([db.collection('users').get(), db.collection('teamMembers').get()])
  const userDocs = usersSnap.docs.map((d) => ({ id: d.id, data: d.data() }))
  const memberDocs = membersSnap.docs.map((d) => ({ id: d.id, data: d.data() }))

  const people = {}
  for (const name of Object.keys(PEOPLE_ALIASES)) {
    const u = matchPerson(name, userDocs)
    const m = matchPerson(name, memberDocs)
    const hit = u || m
    people[name] = hit ? hit.id : null
    console.log(
      `Responsável "${name}": ${hit ? `${hit.id} (${u ? 'users' : 'teamMembers'} — "${hit.data.name}")` : 'NÃO ENCONTRADO — tarefas/ownerIds sem esse id'}`
    )
  }
  const seedActor = people.Ciane || people.Bruno || userDocs[0]?.id || 'seed-script'

  /* ---- PASSO 1: limpar dados de teste ---- */
  const clientsSnap = await db.collection('clients').get()
  const clientIds = new Set(clientsSnap.docs.map((d) => d.id))
  console.log(`\nClientes existentes: ${clientsSnap.size}`)
  clientsSnap.docs.forEach((d) => console.log(`  - ${d.data().companyName ?? d.id}`))

  const linkedRefs = []
  const linkedCounts = {}
  for (const col of ['tasks', 'contents', 'meetings', 'calendarEvents', 'reports', 'approvals']) {
    const snap = await db.collection(col).get()
    const refs = snap.docs.filter((d) => clientIds.has(d.data().clientId)).map((d) => d.ref)
    linkedCounts[col] = refs.length
    linkedRefs.push(...refs)
  }
  console.log('Docs vinculados a apagar junto:', linkedCounts)

  if (!CONFIRM) {
    console.log(`\nDry-run: apagaria ${clientsSnap.size} clientes + ${linkedRefs.length} docs vinculados,`)
    console.log(`e criaria ${CLIENTS.length} clientes + ${CLIENTS.length * TASK_TEMPLATES.length} tarefas.`)
    console.log('Rode de novo com --confirm para executar.')
    return
  }

  const delLinked = await deleteInChunks(db, linkedRefs)
  const delClients = await deleteInChunks(db, clientsSnap.docs.map((d) => d.ref))
  console.log(`Apagados: ${delClients} clientes, ${delLinked} docs vinculados.`)

  /* ---- PASSO 2 + 3: criar clientes e tarefas ---- */
  let createdClients = 0
  let createdTasks = 0

  for (const spec of CLIENTS) {
    const ownerIds = spec.resp.map((n) => people[n]).filter(Boolean)
    const clientRef = db.collection('clients').doc()
    await clientRef.set({
      companyName: spec.name,
      categoria: spec.cat,
      status: 'active',
      segment: 'Limpeza',
      ownerIds,
      modules: { paidTraffic: true, metaAds: true, googleAds: true, socialMedia: false },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: seedActor,
      updatedBy: seedActor,
    })
    createdClients++

    const nicolasIsOwner = people.Nicolas && ownerIds.includes(people.Nicolas)
    const base = Date.now()
    for (let i = 0; i < TASK_TEMPLATES.length; i++) {
      const t = TASK_TEMPLATES[i]
      const assignedTo =
        t.who === 'cs' ? people.Janilson : nicolasIsOwner ? people.Nicolas : people.Ciane

      const doc = {
        title: `${t.title} — ${spec.name}`,
        description: RECURRING_DESC,
        clientId: clientRef.id,
        dueDate: null,
        priority: 'normal',
        status: 'todo',
        checklist: t.checklist.map((text) => ({ id: randomUUID(), text, done: false })),
        order: base + i,
        recurrence: t.recurrence,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: seedActor,
        updatedBy: seedActor,
      }
      if (assignedTo) doc.assignedTo = assignedTo
      await db.collection('tasks').add(doc)
      createdTasks++
    }
  }

  console.log(`\n✔ Criados ${createdClients} clientes e ${createdTasks} tarefas.`)
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error('\nFALHOU:', err)
    process.exit(1)
  }
)
