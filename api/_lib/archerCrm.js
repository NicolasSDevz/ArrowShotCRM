// Ferramentas do Archer (ver api/ai/chat.js) que leem e escrevem o próprio
// CRM — tarefas, leads, reuniões, conteúdos, otimizações, visão geral da
// agência e os dois briefings do cliente. As de Google/Meta Ads continuam no
// chat.js. Tudo aqui roda com a service account (firebaseAdmin.js), então
// cada ferramenta escolhe a dedo o que devolve: nunca senhas/credenciais
// (clientCredentials) nem tokens.

import { randomUUID } from 'node:crypto'
import { getDoc, listDocs, queryDocs, setDoc, updateDocPaths } from './firebaseAdmin.js'

// ---------------------------------------------------------------- utilidades

const DAY_MS = 24 * 3600 * 1000

export const normalize = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/** Timestamps chegam do REST como ISO string. */
const day = (iso) => (iso ? String(iso).slice(0, 10) : null)
const ms = (iso) => (iso ? new Date(iso).getTime() : NaN)

const clampLimit = (n, def, max) => Math.min(max, Math.max(1, Number(n) || def))

/** Corta textos longos (anotações, roteiros) pra não estourar o contexto. */
const cut = (s, max = 600) => {
  if (!s) return undefined
  const str = String(s)
  return str.length > max ? `${str.slice(0, max)}…` : str
}

const TASK_STATUS_LABEL = {
  todo: 'A Fazer',
  in_progress: 'Em andamento',
  review: 'Revisão',
  waiting_client: 'Aguardando cliente',
  done: 'Concluído',
  new_client: 'Novo cliente',
  onboarding: 'Onboarding',
  briefing: 'Briefing',
  access_setup: 'Acessos',
  planning: 'Planejamento',
  active: 'Ativo',
}
const TASK_DONE = new Set(['done', 'active'])

const LEAD_STATUS_LABEL = {
  new: 'Novo Lead',
  contacted: 'Contato Feito',
  negotiation: 'Negociação',
  closed: 'Fechado',
  lost: 'Perdido',
}

const CONTENT_STATUS_LABEL = {
  ideas: 'Produzir',
  production: 'Em Produção',
  review: 'Revisão',
  approved: 'Aprovado',
  scheduled: 'Agendado',
  published: 'Publicado',
  cancelled: 'Cancelado',
}

const MEETING_TYPE_LABEL = {
  daily: 'Daily',
  continuous_improvement: 'Melhoria contínua',
  partnership: 'Reunião de Sociedade',
  one_on_one: '1:1',
  monthly_team: 'Mensal do time',
  onboarding: 'Onboarding',
  briefing: 'Reunião de Briefing',
  strategy_access: 'Estratégia e acessos',
  monthly_consulting: 'Consultoria mensal',
}

const CLIENT_STATUS_LABEL = { active: 'Ativo', paused: 'Pausado', churned: 'Encerrado', prospect: 'Prospect' }

// ---------------------------------------------------------------- diretórios (1 leitura por mensagem)

/** Cache por mensagem: várias ferramentas na mesma resposta reaproveitam a
 *  mesma leitura de clientes/usuários/tarefas. */
export function createCrmDirectory() {
  const cache = new Map()
  const once = (key, fn) => {
    if (!cache.has(key)) cache.set(key, fn())
    return cache.get(key)
  }
  const clients = () => once('clients', () => listDocs('clients'))
  const users = () => once('users', () => listDocs('users'))

  async function userName(id) {
    if (!id) return null
    const u = (await users()).find((x) => x.id === id)
    return u?.name || null
  }

  /** Acha alguém da equipe pelo nome (parcial, sem acento). */
  async function findUser(name) {
    const q = normalize(name)
    if (!q) return null
    const team = (await users()).filter((u) => u.role !== 'client')
    const hits = team.filter((u) => normalize(u.name).startsWith(q) || normalize(u.name).includes(q))
    if (hits.length === 0) throw new Error(`Ninguém da equipe chamado "${name}". Equipe: ${team.map((u) => u.name).join(', ')}.`)
    if (hits.length > 1) throw new Error(`Mais de uma pessoa bate com "${name}": ${hits.map((u) => u.name).join(', ')}.`)
    return hits[0]
  }

  return {
    clients,
    users,
    userName,
    findUser,
    tasks: () => once('tasks', () => listDocs('tasks')),
    leads: () => once('leads', () => listDocs('leads')),
    pipelines: () => once('pipelines', () => listDocs('leadPipelines')),
    clientName: async (id) => (id ? (await clients()).find((c) => c.id === id)?.companyName || null : null),
    /** Acha o cliente pelo nome (exato > começa com > contém). Erro amigável se nenhum ou vários. */
    async find(name) {
      const q = normalize(name)
      if (!q) throw new Error('Informe o nome do cliente.')
      const all = (await clients()).filter((c) => c.status !== 'churned' || normalize(c.companyName) === q)
      const exact = all.filter((c) => normalize(c.companyName) === q)
      const starts = all.filter((c) => normalize(c.companyName).startsWith(q))
      const contains = all.filter((c) => normalize(c.companyName).includes(q))
      const hits = exact.length ? exact : starts.length ? starts : contains
      if (hits.length === 1) return hits[0]
      if (hits.length === 0) throw new Error(`Nenhum cliente encontrado com "${name}". Use listar_clientes pra ver os nomes.`)
      throw new Error(`Mais de um cliente bate com "${name}": ${hits.map((c) => c.companyName).join(', ')}. Seja mais específico.`)
    },
  }
}

// ---------------------------------------------------------------- ficha do cliente

const activeModules = (c) =>
  Object.entries(c.modules || {})
    .filter(([, v]) => v)
    .map(([k]) => k)

/** Tira campos vazios pra resposta ficar enxuta e o modelo ver o que falta. */
function compact(obj) {
  if (Array.isArray(obj)) return obj.map(compact).filter((v) => v !== undefined)
  if (obj && typeof obj === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      const c = compact(v)
      if (c === undefined || c === null || c === '' || (Array.isArray(c) && c.length === 0)) continue
      if (typeof c === 'object' && !Array.isArray(c) && Object.keys(c).length === 0) continue
      out[k] = c
    }
    return out
  }
  return obj
}

function contactsOf(list) {
  return (list || []).filter((p) => p?.name).map((p) => ({ nome: p.name, email: p.email || undefined, whatsapp: p.whatsapp || undefined }))
}

export async function toolClientDetails(dir, input) {
  const c = await dir.find(input.cliente)
  const planning = c.campaignPlanning || {}
  const pt = c.paidTrafficBriefing || {}
  const sm = c.briefing || {}

  const [optimizations, evaluations, ownerNames] = await Promise.all([
    queryDocs('optimizations', [['clientId', c.id]]).catch(() => []),
    queryDocs('clientSuccessEvaluations', [['clientId', c.id]]).catch(() => []),
    Promise.all((c.ownerIds || (c.ownerId ? [c.ownerId] : [])).map((id) => dir.userName(id))),
  ])

  return compact({
    cliente: c.companyName,
    status: CLIENT_STATUS_LABEL[c.status] || c.status,
    categoria: c.categoria,
    segmento: c.segment,
    cidade: c.city,
    responsaveisNaAgencia: ownerNames.filter(Boolean),
    servicos: activeModules(c),
    valorMensal: c.monthlyValue ?? null,
    inicioContrato: day(c.contractStartDate),
    contato: { whatsapp: c.whatsapp, email: c.email, instagram: c.instagram, site: c.website },
    anotacoes: cut(c.notes, 1500),
    briefingTrafegoPago: {
      salvoPor: pt.preenchidoPor,
      salvoEm: day(pt.filledAt),
      responsaveis: {
        socios: contactsOf(pt.socios),
        decisores: contactsOf(pt.decisores),
        aprovadoresCampanhas: contactsOf(pt.aprovadoresCampanhas),
        financeiro: contactsOf(pt.financeiro),
        marketing: contactsOf(pt.marketing),
        comercial: contactsOf(pt.comercial),
      },
      ...Object.fromEntries(Object.keys(PAID_TRAFFIC_FIELDS).map((k) => [k, pt[k]])),
    },
    briefingSocialMedia: {
      salvoPor: sm.preenchidoPor,
      salvoEm: day(sm.filledAt),
      ...Object.fromEntries(Object.keys(SOCIAL_FIELDS).map((k) => [k, sm[k]])),
    },
    planejamentoCampanha: {
      metaAds: planning.metaAds,
      googleAds: planning.googleAds,
      observacoesGerais: planning.observacoesGerais,
      contaMetaAds: planning.acessos?.metaAdsAccountId,
      contaGoogleAds: planning.acessos?.googleAdsAccountId,
      site: planning.acessos?.siteUrl,
      gtm: planning.acessos
        ? { criado: planning.acessos.gtmContainerCriado, instalado: planning.acessos.gtmInstaladoNoSite, rastreamentoCompleto: planning.acessos.gtmRastreamentoCompleto }
        : undefined,
    },
    funilComercial: c.salesFunnel,
    sucessoDoCliente: evaluations
      .sort((a, b) => String(b.referenceMonth).localeCompare(String(a.referenceMonth)))
      .slice(0, 3)
      .map((e) => ({ mes: e.referenceMonth, nota: e.score, faixa: e.tier, notas: e.scores, obs: cut(e.notes, 300) })),
    ultimasOtimizacoes: optimizations
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5)
      .map((o) => ({
        data: day(o.date),
        por: o.responsavelName,
        plataformas: o.platforms,
        otimizacoes: cut(o.optimizationsText || [o.metaOptimizationsText, o.googleOptimizationsText].filter(Boolean).join(' | '), 500),
        observacoes: cut(o.notes, 200),
      })),
  })
}

// ---------------------------------------------------------------- tarefas

export async function toolTasks(dir, input) {
  const now = Date.now()
  let tasks = await dir.tasks()
  if (input.cliente) {
    const c = await dir.find(input.cliente)
    tasks = tasks.filter((t) => t.clientId === c.id)
  }
  if (input.responsavel) {
    const u = await dir.findUser(input.responsavel)
    tasks = tasks.filter((t) => t.assignedTo === u.id)
  }
  const situacao = input.situacao || 'abertas'
  tasks = tasks.filter((t) => {
    const done = TASK_DONE.has(t.status)
    if (situacao === 'abertas') return !done
    if (situacao === 'atrasadas') return !done && ms(t.dueDate) < now - DAY_MS / 2
    if (situacao === 'concluidas') return done
    return true
  })
  tasks.sort((a, b) => (ms(a.dueDate) || Infinity) - (ms(b.dueDate) || Infinity))
  const limit = clampLimit(input.limite, 40, 150)

  return {
    situacao,
    total: tasks.length,
    tarefas: await Promise.all(
      tasks.slice(0, limit).map(async (t) => {
        const checklist = t.checklist || []
        return compact({
          titulo: t.title,
          cliente: await dir.clientName(t.clientId),
          responsavel: await dir.userName(t.assignedTo),
          status: TASK_STATUS_LABEL[t.status] || t.status,
          prioridade: t.priority,
          prazo: day(t.dueDate),
          atrasada: !TASK_DONE.has(t.status) && ms(t.dueDate) < now - DAY_MS / 2 ? true : undefined,
          checklist: checklist.length ? `${checklist.filter((i) => i.done).length}/${checklist.length}` : undefined,
          descricao: cut(t.description, 200),
        })
      })
    ),
  }
}

// ---------------------------------------------------------------- leads

export async function toolLeads(dir, input) {
  const [leads, pipelines] = await Promise.all([dir.leads(), dir.pipelines()])
  const stageInfo = (lead) => {
    const p = pipelines.find((x) => x.id === lead.pipelineId)
    const s = p?.stages?.find((x) => x.id === lead.status)
    if (s) return { funil: p.name, etapa: s.label, kind: s.kind }
    const kind = lead.status === 'closed' ? 'won' : lead.status === 'lost' ? 'lost' : 'open'
    return { funil: p?.name || 'Comercial', etapa: LEAD_STATUS_LABEL[lead.status] || lead.status, kind }
  }

  let rows = leads.map((l) => ({ l, ...stageInfo(l) }))
  const q = normalize(input.busca)
  if (q) rows = rows.filter(({ l }) => normalize(`${l.contactName} ${l.companyName} ${l.cityRegion}`).includes(q))
  if (input.etapa) rows = rows.filter((r) => normalize(r.etapa).includes(normalize(input.etapa)))
  const situacao = input.situacao || 'abertos'
  if (situacao === 'abertos') rows = rows.filter((r) => r.kind === 'open')
  if (situacao === 'ganhos') rows = rows.filter((r) => r.kind === 'won')
  if (situacao === 'perdidos') rows = rows.filter((r) => r.kind === 'lost')

  // Resumo do funil (sempre sobre todos os leads, sem filtro de busca)
  const resumo = {}
  for (const l of leads) {
    const { funil, etapa } = stageInfo(l)
    const key = `${funil} › ${etapa}`
    resumo[key] ??= { leads: 0, valorEstimado: 0 }
    resumo[key].leads++
    resumo[key].valorEstimado += Number(l.estimatedValue) || 0
  }

  rows.sort((a, b) => String(b.l.createdAt).localeCompare(String(a.l.createdAt)))
  const limit = clampLimit(input.limite, 30, 100)
  const now = Date.now()
  return {
    resumoDoFunil: resumo,
    total: rows.length,
    leads: await Promise.all(
      rows.slice(0, limit).map(async ({ l, funil, etapa }) =>
        compact({
          contato: l.contactName,
          empresa: l.companyName,
          cidade: l.cityRegion,
          funil,
          etapa,
          origem: l.source,
          valorEstimado: l.estimatedValue,
          responsavel: await dir.userName(l.assignedTo),
          criadoEm: day(l.createdAt),
          naEtapaDesde: day(l.stageChangedAt),
          proximaAcao: l.nextAction,
          dataProximaAcao: day(l.nextActionDate),
          proximaAcaoAtrasada: ms(l.nextActionDate) < now - DAY_MS ? true : undefined,
          motivoPerda: l.lostReason ? `${l.lostReason}${l.lostReasonNote ? ` — ${l.lostReasonNote}` : ''}` : undefined,
          anotacoes: cut(l.notes, 300),
          ultimosContatos: (l.contactHistory || [])
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))
            .slice(0, 3)
            .map((h) => ({ data: day(h.date), tipo: h.type, resultado: h.outcome, resumo: cut(h.summary, 200) })),
        })
      )
    ),
  }
}

// ---------------------------------------------------------------- reuniões

export async function toolMeetings(dir, input) {
  let meetings
  if (input.cliente) {
    const c = await dir.find(input.cliente)
    meetings = await queryDocs('meetings', [['clientId', c.id]])
  } else {
    meetings = await listDocs('meetings')
  }
  const now = Date.now()
  const dias = clampLimit(input.dias, 30, 365)
  const quando = input.quando || 'passadas'
  meetings = meetings.filter((m) => {
    const t = ms(m.date)
    if (quando === 'proximas') return t >= now - DAY_MS && t <= now + dias * DAY_MS
    if (quando === 'passadas') return t < now && t >= now - dias * DAY_MS
    return t >= now - dias * DAY_MS && t <= now + dias * DAY_MS
  })
  meetings.sort((a, b) => (quando === 'proximas' ? ms(a.date) - ms(b.date) : ms(b.date) - ms(a.date)))
  const limit = clampLimit(input.limite, 15, 50)
  return {
    total: meetings.length,
    reunioes: await Promise.all(
      meetings.slice(0, limit).map(async (m) =>
        compact({
          data: day(m.date),
          hora: m.time,
          tipo: MEETING_TYPE_LABEL[m.type] || m.type,
          cliente: await dir.clientName(m.clientId),
          participantes: (await Promise.all((m.participantIds || []).map((id) => dir.userName(id)))).filter(Boolean),
          pauta: cut(m.agenda, 500),
          decisoes: cut(m.decisions, 800),
          anotacoes: cut(m.notes, 1200),
          encaminhamentos: await Promise.all(
            (m.actionItems || []).map(async (a) => compact({ o_que: a.description, quem: await dir.userName(a.assignedTo), prazo: day(a.dueDate) }))
          ),
          gravacao: m.recordingLink,
        })
      )
    ),
  }
}

// ---------------------------------------------------------------- conteúdos (social media)

export async function toolContents(dir, input) {
  let contents
  if (input.cliente) {
    const c = await dir.find(input.cliente)
    contents = await queryDocs('contents', [['clientId', c.id]])
  } else {
    contents = await listDocs('contents')
  }
  if (input.status) {
    const st = normalize(input.status)
    contents = contents.filter((x) => normalize(CONTENT_STATUS_LABEL[x.status] || x.status).includes(st) || x.status === input.status)
  }
  if (input.mes && /^\d{4}-\d{2}$/.test(input.mes)) contents = contents.filter((x) => String(x.scheduledDate || '').startsWith(input.mes))

  const porStatus = {}
  for (const x of contents) {
    const k = CONTENT_STATUS_LABEL[x.status] || x.status
    porStatus[k] = (porStatus[k] || 0) + 1
  }
  contents.sort((a, b) => String(b.scheduledDate || '').localeCompare(String(a.scheduledDate || '')))
  const limit = clampLimit(input.limite, 30, 100)
  return {
    total: contents.length,
    porStatus,
    conteudos: await Promise.all(
      contents.slice(0, limit).map(async (x) =>
        compact({
          titulo: x.title,
          cliente: x.clientNameSnapshot || (await dir.clientName(x.clientId)),
          tipo: x.type,
          status: CONTENT_STATUS_LABEL[x.status] || x.status,
          dataPublicacao: day(x.scheduledDate),
          responsavel: await dir.userName(x.assignedTo),
          objetivo: cut(x.objective, 200),
          legenda: input.com_textos ? cut(x.caption, 800) : undefined,
          roteiro: input.com_textos ? cut(x.script, 800) : undefined,
        })
      )
    ),
  }
}

// ---------------------------------------------------------------- otimizações

export async function toolOptimizations(dir, input) {
  let opts
  if (input.cliente) {
    const c = await dir.find(input.cliente)
    opts = await queryDocs('optimizations', [['clientId', c.id]])
  } else {
    opts = await listDocs('optimizations')
  }
  if (input.responsavel) {
    const u = await dir.findUser(input.responsavel)
    opts = opts.filter((o) => o.responsavelId === u.id)
  }
  const dias = clampLimit(input.dias, 14, 365)
  const since = Date.now() - dias * DAY_MS
  opts = opts.filter((o) => ms(o.date) >= since).sort((a, b) => ms(b.date) - ms(a.date))

  const porPessoa = {}
  for (const o of opts) porPessoa[o.responsavelName || '—'] = (porPessoa[o.responsavelName || '—'] || 0) + 1

  // Clientes com tráfego ativo que não tiveram otimização no período
  const clients = (await dir.clients()).filter((c) => c.status === 'active' && (c.modules?.paidTraffic || c.modules?.googleAds || c.modules?.metaAds))
  const optimizedIds = new Set(opts.map((o) => o.clientId))

  const limit = clampLimit(input.limite, 30, 100)
  return {
    periodo: `últimos ${dias} dias`,
    total: opts.length,
    porPessoa,
    clientesDeTrafegoSemOtimizacaoNoPeriodo: input.cliente || input.responsavel ? undefined : clients.filter((c) => !optimizedIds.has(c.id)).map((c) => c.companyName),
    otimizacoes: await Promise.all(
      opts.slice(0, limit).map(async (o) =>
        compact({
          data: day(o.date),
          cliente: await dir.clientName(o.clientId),
          por: o.responsavelName,
          plataformas: o.platforms,
          meta: cut(o.metaOptimizationsText, 400),
          google: cut(o.googleOptimizationsText, 400),
          texto: o.metaOptimizationsText || o.googleOptimizationsText ? undefined : cut(o.optimizationsText, 500),
          saldoMeta: o.metaBalance,
          saldoGoogle: o.googleBalance,
          observacoes: cut(o.notes, 200),
        })
      )
    ),
  }
}

// ---------------------------------------------------------------- visão geral da agência

export async function toolAgencyOverview(dir) {
  const now = Date.now()
  const [clients, tasks, leads, pipelines, meetings, opts, contents] = await Promise.all([
    dir.clients(),
    dir.tasks(),
    dir.leads(),
    dir.pipelines(),
    listDocs('meetings').catch(() => []),
    listDocs('optimizations').catch(() => []),
    listDocs('contents').catch(() => []),
  ])

  const active = clients.filter((c) => c.status === 'active')
  const byStatus = {}
  for (const c of clients) byStatus[CLIENT_STATUS_LABEL[c.status] || c.status] = (byStatus[CLIENT_STATUS_LABEL[c.status] || c.status] || 0) + 1

  const overdue = tasks.filter((t) => !TASK_DONE.has(t.status) && ms(t.dueDate) < now - DAY_MS / 2)
  const overdueByPerson = {}
  for (const t of overdue) {
    const n = (await dir.userName(t.assignedTo)) || 'Sem responsável'
    overdueByPerson[n] = (overdueByPerson[n] || 0) + 1
  }

  const openLeads = leads.filter((l) => {
    const p = pipelines.find((x) => x.id === l.pipelineId)
    const s = p?.stages?.find((x) => x.id === l.status)
    return s ? s.kind === 'open' : !['closed', 'lost'].includes(l.status)
  })

  const recentOpts = opts.filter((o) => ms(o.date) >= now - 7 * DAY_MS)
  const optimized = new Set(recentOpts.map((o) => o.clientId))
  const trafficClients = active.filter((c) => c.modules?.paidTraffic || c.modules?.googleAds || c.modules?.metaAds)

  return compact({
    clientesPorStatus: byStatus,
    mrrClientesAtivos: active.reduce((s, c) => s + (Number(c.monthlyValue) || 0), 0),
    clientesAtivosSemValorMensal: active.filter((c) => !c.monthlyValue).map((c) => c.companyName),
    briefingTrafegoNaoPreenchido: trafficClients.filter((c) => !c.paidTrafficBriefing?.filledAt).map((c) => c.companyName),
    briefingSocialNaoPreenchido: active.filter((c) => c.modules?.socialMedia && !c.briefing?.filledAt).map((c) => c.companyName),
    tarefas: {
      abertas: tasks.filter((t) => !TASK_DONE.has(t.status)).length,
      atrasadas: overdue.length,
      atrasadasPorPessoa: overdueByPerson,
    },
    leads: {
      emAberto: openLeads.length,
      valorEstimadoEmAberto: openLeads.reduce((s, l) => s + (Number(l.estimatedValue) || 0), 0),
      criadosUltimos30Dias: leads.filter((l) => ms(l.createdAt) >= now - 30 * DAY_MS).length,
      comProximaAcaoAtrasada: openLeads.filter((l) => ms(l.nextActionDate) < now - DAY_MS).length,
    },
    reunioesProximos7Dias: await Promise.all(
      meetings
        .filter((m) => ms(m.date) >= now - DAY_MS / 2 && ms(m.date) <= now + 7 * DAY_MS)
        .sort((a, b) => ms(a.date) - ms(b.date))
        .map(async (m) => compact({ data: day(m.date), hora: m.time, tipo: MEETING_TYPE_LABEL[m.type] || m.type, cliente: await dir.clientName(m.clientId) }))
    ),
    otimizacoesUltimos7Dias: recentOpts.length,
    clientesDeTrafegoSemOtimizacaoHa7Dias: trafficClients.filter((c) => !optimized.has(c.id)).map((c) => c.companyName),
    conteudosEmRevisaoOuAprovacao: contents.filter((x) => x.status === 'review').length,
  })
}

// ---------------------------------------------------------------- escrita nos briefings

/** Campos do Briefing de Tráfego Pago (src/types/paidTrafficBriefing.ts) que
 *  o Archer pode preencher, com o tipo de cada um. */
const PAID_TRAFFIC_FIELDS = {
  estruturaTime: 'string',
  processoVendas: 'string',
  sistemaGestaoLeads: 'string',
  cicloVenda: 'string',
  canalQueMaisVende: 'string',
  tempoDeMercado: 'string',
  percepcaoMercado: 'string',
  clientesAtendidos: 'string',
  marcasAtendidasRegiao: 'string',
  desafiosAtuais: 'string',
  objecaoComum: 'string',
  resultadoEsperado: 'string',
  mesesMaisFortes: 'string',
  mesesMaisFracos: 'string',
  ticketMedio: 'number',
  faturamentoMensal: 'number',
  formasPagamento: 'string',
  cartaoCreditoAnuncios: ['sim', 'nao', 'boleto'],
  b2cGenero: 'string',
  b2cEstadoCivilFilhos: 'string',
  b2cFaixaEtaria: 'string',
  b2cEscolaridadeProfissao: 'string',
  b2cRegiao: 'string',
  b2cDorPrincipal: 'string',
  b2cSolucoesTentadas: 'string',
  b2bSetor: 'string',
  b2bFaturamentoMinimo: 'number',
  b2bQuantidadeFuncionarios: 'string',
  b2bCargoDecisor: 'string',
  b2bLocalizacao: 'string',
  observacoes: 'string',
}

const CONTACT_ROLES = ['socios', 'decisores', 'aprovadoresCampanhas', 'financeiro', 'marketing', 'comercial']

/** Campos do Briefing de Social Media (ClientBriefing em src/types/client.ts). */
const SOCIAL_FIELDS = {
  tempoMercado: 'string',
  numeroObras: 'string',
  servicos: 'string',
  atendeTipo: ['residencial', 'comercial', 'ambos'],
  ticketMedio: 'string',
  diferencial: 'string',
  naoAssociar: 'string',
  clienteIdeal: 'string',
  atendeB2B: 'boolean',
  setorB2B: 'string',
  dorPrincipal: 'string',
  objecaoComum: 'string',
  tomVoz: ['profissional_sobrio', 'moderno_descontraido', 'premium_aspiracional'],
  coresMarca: 'string',
  referenciaPerfil: 'string',
  naoQuerVer: 'string',
  observacoesIdentidade: 'string',
  logoEnviada: 'boolean',
  fotosAntesDepois: 'boolean',
  fotosAntesDepoisQtd: 'string',
  videosDisponiveis: 'boolean',
  depoimentosClientes: 'boolean',
  fotoEquipe: 'boolean',
  linkDriveMateriais: 'string',
  canalAprovacao: ['whatsapp', 'email', 'drive', 'outro'],
  prazoAprovacao: 'string',
  responsavelAprovacao: 'string',
  observacoesGerais: 'string',
}

function schemaFor(fields) {
  const props = {}
  for (const [k, t] of Object.entries(fields)) {
    props[k] = Array.isArray(t) ? { type: 'string', enum: t } : { type: t }
  }
  return props
}

/** Converte/valida um valor vindo do modelo pro tipo do campo. */
function coerce(type, value) {
  if (value === null || value === undefined) return undefined
  if (Array.isArray(type)) return type.includes(value) ? value : undefined
  if (type === 'number') {
    const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : undefined
  }
  if (type === 'boolean') return typeof value === 'boolean' ? value : undefined
  const s = String(value).trim()
  return s ? s.slice(0, 4000) : undefined
}

const isEmpty = (v) => v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))

async function writeBriefing({ dir, user, input, root, fields, label }) {
  const found = await dir.find(input.cliente)
  // Relê o doc na hora de gravar — a lista de clientes pode estar alguns segundos velha.
  const snap = await getDoc(`clients/${found.id}`)
  if (!snap.exists) throw new Error('Cliente não encontrado.')
  const client = snap.data()
  const current = client[root] || {}
  const overwrite = !!input.sobrescrever

  const nested = {}
  const paths = []
  const gravados = []
  const pulados = []
  const invalidos = []

  for (const [key, raw] of Object.entries(input.campos || {})) {
    const type = fields[key]
    if (!type) {
      invalidos.push(`${key} (campo não existe)`)
      continue
    }
    const value = coerce(type, raw)
    if (value === undefined) {
      invalidos.push(`${key} (valor inválido: ${JSON.stringify(raw)})`)
      continue
    }
    if (!isEmpty(current[key]) && !overwrite) {
      if (current[key] !== value) pulados.push({ campo: key, valorAtual: current[key], valorSugerido: value })
      continue
    }
    nested[key] = value
    paths.push(`${root}.${key}`)
    gravados.push({ campo: key, valor: value })
  }

  // Responsáveis (só Tráfego Pago): acrescenta contatos, sem apagar os que já existem.
  if (root === 'paidTrafficBriefing') {
    for (const p of input.responsaveis || []) {
      if (!CONTACT_ROLES.includes(p?.papel) || !String(p?.nome || '').trim()) {
        invalidos.push(`responsável ${JSON.stringify(p)}`)
        continue
      }
      const list = nested[p.papel] ?? (current[p.papel] || []).filter((x) => x?.name)
      if (list.some((x) => normalize(x.name) === normalize(p.nome))) {
        pulados.push({ campo: p.papel, valorAtual: p.nome, motivo: 'já cadastrado' })
        continue
      }
      list.push({ id: randomUUID(), name: String(p.nome).trim(), email: String(p.email || '').trim(), whatsapp: String(p.whatsapp || '').trim(), birthday: null })
      nested[p.papel] = list
      if (!paths.includes(`${root}.${p.papel}`)) paths.push(`${root}.${p.papel}`)
      gravados.push({ campo: p.papel, valor: p.nome })
    }
    // O formulário do CRM espera os 6 papéis como lista (form.socios.map...) —
    // num briefing que ainda não existia, cria os que faltam vazios.
    for (const role of CONTACT_ROLES) {
      if (!Array.isArray(current[role]) && !nested[role]) {
        nested[role] = [{ id: randomUUID(), name: '', email: '', whatsapp: '', birthday: null }]
        paths.push(`${root}.${role}`)
      }
    }
  }

  if (gravados.length === 0) {
    return { gravado: false, cliente: client.companyName, briefing: label, motivo: 'Nada novo pra gravar.', pulados, invalidos }
  }

  nested.preenchidoPor = `${user.name} (via Archer)`
  paths.push(`${root}.preenchidoPor`)
  await updateDocPaths(`clients/${found.id}`, { [root]: nested, updatedAt: new Date(), updatedBy: user.uid }, [...paths, 'updatedAt', 'updatedBy'])

  // Histórico da ficha (mesma coleção do logActivity do frontend) — best effort.
  try {
    await setDoc(`activities/${randomUUID()}`, {
      entityType: 'client',
      entityId: found.id,
      clientId: found.id,
      action: 'updated',
      message: `Archer preencheu no ${label}: ${gravados.map((g) => g.campo).join(', ')}`,
      userId: user.uid,
      userName: user.name,
      createdAt: new Date(),
    })
  } catch (err) {
    console.warn('[archer] falha ao registrar atividade', err.message)
  }

  return { gravado: true, cliente: client.companyName, briefing: label, gravados, pulados, invalidos }
}

export const toolWritePaidTrafficBriefing = (deps, input) =>
  writeBriefing({ ...deps, input, root: 'paidTrafficBriefing', fields: PAID_TRAFFIC_FIELDS, label: 'Briefing de Tráfego Pago' })

export const toolWriteSocialBriefing = (deps, input) =>
  writeBriefing({ ...deps, input, root: 'briefing', fields: SOCIAL_FIELDS, label: 'Briefing de Social Media' })

// ---------------------------------------------------------------- definições pro modelo

const clienteProp = { type: 'string', description: 'Nome do cliente (pode ser parcial).' }

export const CRM_TOOLS = [
  {
    name: 'resumo_agencia',
    description:
      'Raio-x da agência agora: clientes por status, MRR, briefings não preenchidos, tarefas abertas/atrasadas por pessoa, leads em aberto e valor, reuniões dos próximos 7 dias, clientes de tráfego sem otimização há 7 dias, conteúdos em revisão. Use em perguntas gerais ("como estamos?", "o que precisa de atenção?").',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'tarefas',
    description: 'Tarefas do CRM, com cliente, responsável, status, prazo e checklist. Filtre por cliente e/ou responsável.',
    input_schema: {
      type: 'object',
      properties: {
        cliente: clienteProp,
        responsavel: { type: 'string', description: 'Nome de alguém da equipe (ex: Ciane).' },
        situacao: { type: 'string', enum: ['abertas', 'atrasadas', 'concluidas', 'todas'], description: 'Padrão: abertas.' },
        limite: { type: 'integer', description: 'Padrão 40, máximo 150.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'leads',
    description: 'Leads comerciais (funil de vendas): resumo por etapa com valor estimado + lista de leads com próxima ação, origem, histórico de contatos e motivo de perda.',
    input_schema: {
      type: 'object',
      properties: {
        situacao: { type: 'string', enum: ['abertos', 'ganhos', 'perdidos', 'todos'], description: 'Padrão: abertos.' },
        etapa: { type: 'string', description: 'Nome da etapa (ex: Negociação).' },
        busca: { type: 'string', description: 'Nome do contato, empresa ou cidade.' },
        limite: { type: 'integer', description: 'Padrão 30, máximo 100.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'reunioes',
    description: 'Reuniões registradas (com clientes e internas): pauta, decisões, anotações e encaminhamentos. Ótimo pra saber o que foi combinado com um cliente.',
    input_schema: {
      type: 'object',
      properties: {
        cliente: clienteProp,
        quando: { type: 'string', enum: ['passadas', 'proximas', 'todas'], description: 'Padrão: passadas.' },
        dias: { type: 'integer', description: 'Janela em dias (padrão 30).' },
        limite: { type: 'integer', description: 'Padrão 15, máximo 50.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'conteudos',
    description: 'Conteúdos de Social Media (posts, reels, carrosséis): status, data de publicação, responsável. com_textos=true traz legenda e roteiro.',
    input_schema: {
      type: 'object',
      properties: {
        cliente: clienteProp,
        status: { type: 'string', description: 'Produzir, Em Produção, Revisão, Aprovado, Agendado, Publicado ou Cancelado.' },
        mes: { type: 'string', description: 'yyyy-MM (data de publicação).' },
        com_textos: { type: 'boolean' },
        limite: { type: 'integer', description: 'Padrão 30, máximo 100.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'otimizacoes',
    description: 'Otimizações registradas pela equipe nas contas de anúncio (o que foi feito, quem fez, saldo). Sem cliente, mostra também quais clientes de tráfego ficaram sem otimização no período.',
    input_schema: {
      type: 'object',
      properties: {
        cliente: clienteProp,
        responsavel: { type: 'string' },
        dias: { type: 'integer', description: 'Padrão 14.' },
        limite: { type: 'integer', description: 'Padrão 30, máximo 100.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'preencher_briefing_trafego',
    description:
      'GRAVA campos no Briefing de Tráfego Pago do cliente. Por padrão só preenche campos vazios; campos já preenchidos voltam em "pulados" (use sobrescrever=true só se o usuário pediu pra substituir). Responsáveis são acrescentados, nunca apagados. Valores em R$ como número (ticketMedio 350, não "R$ 350").',
    input_schema: {
      type: 'object',
      properties: {
        cliente: clienteProp,
        campos: { type: 'object', properties: schemaFor(PAID_TRAFFIC_FIELDS), additionalProperties: false },
        responsaveis: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              papel: { type: 'string', enum: CONTACT_ROLES },
              nome: { type: 'string' },
              email: { type: 'string' },
              whatsapp: { type: 'string', description: '(00) 00000-0000' },
            },
            required: ['papel', 'nome'],
            additionalProperties: false,
          },
        },
        sobrescrever: { type: 'boolean' },
      },
      required: ['cliente'],
      additionalProperties: false,
    },
  },
  {
    name: 'preencher_briefing_social',
    description:
      'GRAVA campos no Briefing de Social Media do cliente. Por padrão só preenche campos vazios; os já preenchidos voltam em "pulados" (sobrescrever=true só se o usuário pediu).',
    input_schema: {
      type: 'object',
      properties: {
        cliente: clienteProp,
        campos: { type: 'object', properties: schemaFor(SOCIAL_FIELDS), additionalProperties: false },
        sobrescrever: { type: 'boolean' },
      },
      required: ['cliente', 'campos'],
      additionalProperties: false,
    },
  },
]

export const CRM_TOOL_LABEL = {
  resumo_agencia: 'visão geral da agência',
  tarefas: 'tarefas',
  leads: 'leads',
  reunioes: 'reuniões',
  conteudos: 'conteúdos',
  otimizacoes: 'otimizações',
  preencher_briefing_trafego: 'gravou no briefing de tráfego',
  preencher_briefing_social: 'gravou no briefing de social media',
}
