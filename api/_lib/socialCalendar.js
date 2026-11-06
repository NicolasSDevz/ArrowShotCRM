// Calendário editorial do mês preenchido pela IA — api/ai?acao=calendario
// (ver vercel.json). Mesmo arquivo da Vercel Function do Archer (limite de
// Functions do plano Hobby).
//
// O front manda a grade do mês já montada pelo plano do cliente (datas,
// formatos e pilares — ver src/services/socialMonthService.ts) e recebe de
// volta, para cada post: título, legenda, CTA, hashtags, texto das telas ou
// roteiro, e o que a produção precisa. A fonte é a ficha do cliente no CRM
// (briefing de Social Mídia, briefing de Tráfego, segmento, anotações), os
// posts dos últimos meses (para não repetir tema) e os temas recentes de
// outros clientes da mesma cidade (para não ficarem parecidos).

import Anthropic from '@anthropic-ai/sdk'
import { getDoc, queryDocs, listDocs } from './firebaseAdmin.js'
import { createCrmDirectory, toolClientDetails } from './archerCrm.js'

const MODEL = 'claude-sonnet-5-5'
const MAX_TOKENS = 16000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TYPES = ['post', 'carousel', 'reels']
const PILLARS = [
  'dor_solucao', 'autoridade', 'prova_social', 'bastidores', 'educativo', 'engajamento',
  'institucional', 'antes_depois', 'diferenciais', 'comercial', 'cta',
]
const TYPE_LABEL = { post: 'Estático', carousel: 'Carrossel', reels: 'Reels' }

const SYSTEM = `Você é a estrategista de conteúdo da Arrow Shot, agência de marketing especializada em empresas de limpeza e facilities no Brasil. Sua tarefa é preencher o calendário editorial de UM mês de Instagram de um cliente, post por post, pronto para a equipe produzir.

Como escrever:
- Português do Brasil, tom direto e próximo, "você" para o público e "a gente" para a marca. Siga o tom de voz do briefing quando houver.
- Fale com o cliente final da empresa (quem contrata a limpeza), não com donos de empresa de limpeza.
- Cada post com um tema concreto e diferente. O mês tem um fio: alterne dor, prova, dica e oferta, e use datas e sazonalidade do mês quando fizer sentido (fim de ano, volta às aulas, chuvas, mudanças, obras).
- Legenda: gancho na primeira linha, até ~600 caracteres, fecha com CTA claro (normalmente WhatsApp/orçamento). Hashtags: 5 a 8, do serviço e da cidade.
- Estático: um título forte para a arte + legenda.
- Carrossel: no campo "roteiro" escreva o texto de cada tela ("Tela 1: …"), 6 a 8 telas, capa com gancho e última tela com CTA. Sugira o modelo da Arrow Shot nas observações: A (Jornada do Herói, autoridade), B (História Curiosa, alcance), C (Alerta Neon, "cuidado com…", diferenciação), D (Diário Editorial, dor e objeção).
- Reels: no campo "roteiro" escreva gancho (0–3s), desenvolvimento e CTA, com o que aparece na tela e o que é falado. Até 30–40s.
- Observações para a produção: que foto ou vídeo do cliente precisa (ex.: antes/depois real, equipe em ação), ou se dá para gerar imagem ilustrativa.

Regras fixas (nunca quebre):
- Nunca invente número, estudo, depoimento, nota de avaliação, quantidade de clientes, prêmio, caso ou história do cliente. Se o briefing não traz o dado, escreva sem ele.
- Sem promessa de resultado garantido.
- Antes e depois só com foto REAL do cliente — nunca peça para gerar antes/depois com IA. Se o briefing diz que não há fotos de antes/depois, use outro tema.
- Respeite "o que não associar" e "o que não quer ver" do briefing.
- Nunca use a palavra "slide" no texto que vai para o Instagram.
- Não repita os temas dos últimos meses do cliente nem copie os temas recentes de outros clientes da mesma cidade.
- Mantenha a data, o formato e o pilar de cada post como vieram. Só troque o pilar se ele não fizer nenhum sentido para o cliente.

Responda SEMPRE chamando a ferramenta preencher_calendario, com os posts na mesma ordem em que vieram.`

const TOOL = {
  name: 'preencher_calendario',
  description: 'Devolve o calendário do mês preenchido, um item por post, na mesma ordem recebida.',
  input_schema: {
    type: 'object',
    properties: {
      posts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            data: { type: 'string', description: 'yyyy-MM-dd, igual à recebida' },
            formato: { type: 'string', enum: TYPES },
            pilar: { type: 'string', enum: PILLARS },
            titulo: { type: 'string', description: 'Tema do post, curto (até 60 caracteres)' },
            legenda: { type: 'string' },
            cta: { type: 'string' },
            hashtags: { type: 'array', items: { type: 'string' } },
            roteiro: { type: 'string', description: 'Texto das telas (carrossel) ou roteiro (reels). Vazio no estático.' },
            observacoes: { type: 'string', description: 'O que a produção precisa (fotos, vídeo, modelo do carrossel).' },
          },
          required: ['data', 'formato', 'pilar', 'titulo', 'legenda', 'cta', 'hashtags', 'observacoes'],
        },
      },
    },
    required: ['posts'],
  },
}

const ym = (d) => String(d).slice(0, 7)

function toDateString(v) {
  if (!v) return null
  if (typeof v === 'string') return v.slice(0, 10)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v.toDate === 'function') return v.toDate().toISOString().slice(0, 10)
  if (v.seconds) return new Date(v.seconds * 1000).toISOString().slice(0, 10)
  return null
}

export async function runSocialCalendar({ clientId, posts }) {
  const snap = await getDoc(`clients/${clientId}`)
  if (!snap.exists) throw new Error('Cliente não encontrado')
  const client = { id: clientId, ...snap.data() }

  const dir = createCrmDirectory()
  const ficha = await toolClientDetails({ ...dir, find: async () => client }, { cliente: client.companyName })

  const month = ym(posts[0].data)
  const [own, allClients] = await Promise.all([
    queryDocs('contents', [['clientId', clientId]]).catch(() => []),
    listDocs('clients').catch(() => []),
  ])
  const recentOwn = own
    .map((c) => ({ data: toDateString(c.scheduledDate), titulo: c.title }))
    .filter((c) => c.data && ym(c.data) < month && ym(c.data) >= ym(shiftMonth(month, -3)))
    .map((c) => `${c.data} — ${c.titulo}`)

  const city = (client.city || '').trim().toLowerCase()
  const neighbours = city
    ? allClients.filter((c) => c.id !== clientId && c.modules?.socialMedia && (c.city || '').trim().toLowerCase() === city && c.status !== 'churned')
    : []
  const neighbourThemes = []
  for (const n of neighbours.slice(0, 5)) {
    const list = await queryDocs('contents', [['clientId', n.id]]).catch(() => [])
    const titles = list
      .map((c) => ({ data: toDateString(c.scheduledDate), titulo: c.title }))
      .filter((c) => c.data && ym(c.data) >= ym(shiftMonth(month, -2)))
      .map((c) => c.titulo)
      .slice(0, 15)
    if (titles.length) neighbourThemes.push(`${n.companyName}: ${titles.join(' · ')}`)
  }

  return askCalendar({ ficha, recentOwn, neighbourThemes, posts, month })
}

/** A chamada à IA em si (separada para dar para testar sem o Firestore). */
export async function askCalendar({ ficha, recentOwn, neighbourThemes, posts, month }) {
  const grade = posts.map((p, i) => `${i + 1}. ${p.data} (${p.diaSemana}) — ${TYPE_LABEL[p.formato] || p.formato} — pilar ${p.pilar}`).join('\n')

  const userContent = [
    '## Ficha do cliente (CRM)',
    JSON.stringify(ficha, null, 1),
    '\n## Posts dos últimos meses deste cliente (não repetir)',
    recentOwn.length ? recentOwn.join('\n') : 'nenhum registrado',
    '\n## Temas recentes de outros clientes da mesma cidade (não copiar)',
    neighbourThemes.length ? neighbourThemes.join('\n') : 'nenhum',
    `\n## Grade do mês (${month})`,
    grade,
    '\n## Tarefa',
    `Preencha os ${posts.length} posts chamando preencher_calendario.`,
  ].join('\n')

  const anthropic = new Anthropic({ timeout: 110_000, maxRetries: 0 })
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    tools: [TOOL],
    // Este modelo não aceita tool_choice forçado ("tool"/"any") — o system
    // prompt manda chamar a ferramenta e, se vier texto, tenta ler o JSON.
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: userContent }],
  })

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  let out = Array.isArray(toolUse?.input?.posts) ? toolUse.input.posts : []
  if (out.length === 0) {
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    const json = text.match(/\{[\s\S]*\}/)
    try {
      const parsed = json ? JSON.parse(json[0]) : null
      if (Array.isArray(parsed?.posts)) out = parsed.posts
    } catch {
      /* segue para o erro abaixo */
    }
  }
  if (out.length === 0) throw new Error('A IA não devolveu o calendário')

  // Casa pela posição e confere data/formato — a grade manda, a IA só preenche.
  return posts.map((p, i) => {
    const o = out.find((x, k) => k === i && x.data === p.data) || out.find((x) => x.data === p.data && x.formato === p.formato) || out[i] || {}
    return {
      data: p.data,
      formato: p.formato,
      pilar: PILLARS.includes(o.pilar) ? o.pilar : p.pilar,
      titulo: String(o.titulo || '').slice(0, 90),
      legenda: String(o.legenda || ''),
      cta: String(o.cta || ''),
      hashtags: Array.isArray(o.hashtags) ? o.hashtags.map((h) => String(h).trim()).filter(Boolean).map((h) => (h.startsWith('#') ? h : `#${h}`)).slice(0, 10) : [],
      roteiro: String(o.roteiro || ''),
      observacoes: String(o.observacoes || ''),
    }
  })
}

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function validateCalendarInput(body) {
  const { clientId, posts } = body || {}
  if (!clientId || typeof clientId !== 'string') return 'clientId é obrigatório'
  if (!Array.isArray(posts) || posts.length === 0 || posts.length > 31) return 'posts inválidos'
  for (const p of posts) {
    if (!p || !DATE_RE.test(p.data) || !TYPES.includes(p.formato) || !PILLARS.includes(p.pilar)) return 'post inválido na grade'
  }
  return null
}
