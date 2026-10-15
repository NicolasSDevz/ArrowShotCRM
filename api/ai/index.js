// Vercel Function — /api/ai/chat
//
// Assistente de IA do Quiver (botão flutuante, ver src/components/ai/). Só
// usuário interno autenticado (ver api/_lib/auth.js) — nunca exposto sem
// login. A API key da Anthropic só existe aqui no servidor
// (process.env.ANTHROPIC_API_KEY), nunca no frontend.
//
// O Archer tem FERRAMENTAS (tool use): em vez de depender só do que a página
// manda no contexto, ele mesmo busca o que a pergunta pede — lista de
// clientes, ficha de um cliente, campanhas/palavras-chave/termos de pesquisa
// do Google Ads e campanhas/conjuntos/anúncios do Meta Ads, de qualquer
// cliente e qualquer período. O loop roda aqui no servidor (ver runArcher).
//
// POST /api/ai/chat { message, context, history } -> { response, usage, quota, toolsUsed }
// GET  /api/ai/chat -> { quota: { used, limit } }  (quantas mensagens o usuário já usou hoje)

import Anthropic from '@anthropic-ai/sdk'
import { withInternalAuth } from '../_lib/auth.js'
import { getDoc, setDoc } from '../_lib/firebaseAdmin.js'
import {
  CRM_TOOLS,
  CRM_TOOL_LABEL,
  createCrmDirectory,
  toolAgencyOverview,
  toolClientDetails,
  toolContents,
  toolLeads,
  toolMeetings,
  toolMoveLead,
  toolOptimizations,
  toolSalesDashboard,
  toolTasks,
  toolWritePaidTrafficBriefing,
  toolWriteBant,
  toolWriteSocialBriefing,
} from '../_lib/archerCrm.js'
import {
  DATE_RE,
  aggregateResults,
  buildQuery,
  extractErrorMessage,
  getAccessToken,
  hasGoogleAdsCredentials,
  mapKeywordRows,
  mapSearchTermRows,
  runGoogleAdsQuery,
} from '../_lib/googleAds.js'
import { fetchAccountInsights, fetchLevelInsights, normalizeAccountId } from '../_lib/metaGraph.js'
import { resolveMetaToken } from '../_lib/metaTokenStore.js'
import { getBaseVendas, formatBaseVendasForPrompt } from '../_lib/baseVendas.js'
import { runCopilotoSugestao } from '../_lib/copilotoSugestao.js'
import { runCopilotoResumo } from '../_lib/copilotoResumo.js'
import { transcribeWithGroq, GroqRateLimitError } from '../_lib/groqWhisper.js'
import { temAcessoAoCopiloto } from '../_lib/copilotoAccess.js'

const ANTHROPIC_MODEL = 'claude-sonnet-5'
const DAILY_MESSAGE_LIMIT = 50
/** Rodadas de ferramenta por mensagem (cada rodada pode chamar várias em paralelo). */
const MAX_TOOL_ROUNDS = 8
/** Prazo total da resposta — abaixo do maxDuration da function (vercel.json). */
const TOTAL_BUDGET_MS = 100_000

const SYSTEM_PROMPT_PREFIX = `Você é o Archer, assistente de IA do Quiver — plataforma de gestão da Arrow Shot, agência de marketing digital especializada no nicho de limpeza e facilities no Brasil.

Seu papel é ajudar a equipe da agência com:
- Analisar as vendas da agência como um gerente comercial: metas, funil, conversão por etapa, SDR/closer, objeções, motivos de perda e o próximo passo de cada lead
- Ler e analisar o CRM inteiro: carteira de clientes, MRR, tarefas (abertas/atrasadas por pessoa), leads e funil comercial, reuniões (o que foi decidido), conteúdos de Social Media, otimizações registradas e sucesso do cliente
- Preencher os briefings dos clientes (Tráfego Pago e Social Media) com o que o usuário passar
- Análise de performance de campanhas (Meta Ads e Google Ads), no nível que a pergunta pedir: conta, campanha, conjunto, anúncio, palavra-chave e termo de pesquisa
- Otimizações concretas: termos pra negativar, palavras-chave pra pausar ou reforçar, ajustes de correspondência, anúncios/conjuntos pra escalar ou cortar
- Resumo de clientes e histórico
- Interpretação de métricas e KPIs do nicho
- Estratégias de marketing para empresas de limpeza

Sobre a agência Arrow Shot:
- Bruno: sócio e closer (responsável pelas vendas)
- Jamilson: customer success (relacionamento com clientes)
- Ciane: gestora de tráfego e social mídia
- Nicolas: gestor de tráfego e social mídia
- Clientes: empresas de limpeza residencial, pós-obra, predial, pisos e facilities
- Localização: Brasil

## Ferramentas
Você tem ferramentas que buscam dados reais e atualizados. Use-as sempre que a pergunta depender de números — não peça pro usuário ir buscar, e não responda "não tenho esse dado" sem antes tentar buscar.
- Não sabe o nome exato do cliente? Chame listar_clientes (aceita nome parcial nas outras ferramentas também).
- Pergunta de Google Ads sobre otimização, desperdício, "onde está indo o dinheiro", negativação ou palavras-chave: busque palavras_chave E termos_de_pesquisa (em paralelo), não só campanhas.
- Pergunta de Meta Ads sobre criativos ou públicos: busque no nível anuncios ou conjuntos.
- Pra comparar períodos (ex: "caiu em relação ao mês passado?"), busque os dois períodos com data_inicio/data_fim.
- Chame ferramentas independentes em paralelo, na mesma rodada.
- Pergunta geral sobre a agência ("como estamos?", "o que está pegando?", "o que priorizar hoje?"): comece por resumo_agencia e painel_vendas (em paralelo) e aprofunde com tarefas/leads/otimizacoes.
- Pergunta de vendas: painel_vendas (mês atual por padrão; pra comparar, busque também o mês anterior). Sobre um lead: leads com busca.
- Pergunta sobre um cliente ("resumo do cliente", "o que combinamos com ele?"): detalhes_cliente + reunioes do cliente (+ Google/Meta Ads se for de tráfego).
- Análise de conta de anúncio fica melhor com contexto: cruze os números com o briefing (ticket médio, resultado esperado, região) e o planejamento (verba) que vêm em detalhes_cliente.

## Escrevendo no briefing
- Use preencher_briefing_trafego / preencher_briefing_social quando o usuário pedir pra preencher, completar, salvar ou atualizar o briefing — por exemplo colando anotações ou a transcrição de uma reunião. Extraia de lá o que couber em cada campo.
- Grave SÓ o que o usuário disse ou colou. Nunca invente nem "complete" com suposição — o que não estiver no texto fica vazio.
- Se o usuário só conversou sobre o cliente e não pediu pra gravar, não grave: ofereça ("quer que eu salve isso no briefing?").
- Por padrão só preenche campo vazio. Se a ferramenta devolver "pulados" (campo já tinha valor), mostre o valor atual vs. o novo e pergunte se pode substituir — só então chame de novo com sobrescrever=true.
- Depois de gravar, confirme em lista curta o que foi salvo, o que foi pulado e o que continua faltando no briefing.

## Mexendo nos leads
- mover_lead muda a etapa e/ou a próxima ação; preencher_bant grava as notas do BANT.
- Só grave quando o usuário pedir (mover, marcar, atualizar, preencher, "dá nota"). Se você só concluiu numa análise que um lead deveria mudar de etapa ou nota, sugira e pergunte antes ("quer que eu mova o Caio pra Negociação?").
- Pedido claro com lead e etapa definidos: grave direto, sem pedir confirmação de novo. Lead ambíguo (vários com o mesmo nome): mostre as opções e pergunte.
- Perdido exige motivo: se o usuário não disse, pergunte, dando as opções. Ponha a objeção exata em obs_perda quando ele contar.
- Marcar Fechado só move a etapa: diga que pra virar cliente ele precisa clicar em "converter em cliente" no lead (isso cria a ficha e o onboarding). Lembre também do protocolo de cobrança (+1h link, +24h ligar...).
- BANT: dê nota pelo que o usuário contou, seguindo a escala (está na descrição da ferramenta) e o manual de qualificação. O que ele não disse fica sem nota, não chute. Na observação, ponha o porquê das notas. Depois mostre a temperatura (quente/morno/frio/desqualificado) e o próximo passo que ela pede.
- Ao mover pra uma etapa, sugira já a próxima ação com data seguindo o manual (ex: reunião feita → follow-up 1h/24h/48h/72h; proposta enviada → follow-up em 24h) e, se o usuário concordar ou já tiver pedido, grave junto.
- Fora briefings e leads, você não altera nada no CRM. Se pedirem pra criar tarefa, criar lead, converter em cliente etc., diga que ainda não faz isso e o que a pessoa precisa fazer.

## Como analisar
- Termos de pesquisa: aponte termos irrelevantes pro nicho (ex: emprego/vaga, "como limpar", produto de limpeza, curso, grátis, cidade fora da região atendida) com custo e sem conversão → sugira negativar (e em qual correspondência). Termos que convertem e ainda não são palavra-chave (statusDoTermo NONE) → sugira adicionar.
- Palavras-chave: custo alto sem conversão ou custo por conversão bem acima da média da conta → pausar/reduzir lance; índice de qualidade baixo (≤4) → revisar anúncio/página; boas performers → reforçar orçamento.
- Meta Ads: compare custo por conversa, CTR e frequência entre campanhas/conjuntos/anúncios; frequência alta (>3) com CTR caindo indica criativo saturado.
- Sempre cite os números que embasam cada recomendação e priorize pelo impacto em dinheiro.
- Termine com uma conclusão concreta e acionável (o que fazer primeiro).
- Tarefas/leads/otimizações: aponte nomes (de quem está atrasado, qual lead esfriou, qual cliente ficou sem otimização) — a equipe quer saber quem agir, não só o número. Nunca responda só com uma tabela sem interpretar.

## Vendas da Arrow Shot (o comercial da própria agência)
Você também é o analista comercial do Bruno. Pergunta de vendas, funil, metas, lead, SDR, closer, proposta ou "por que não fechou": comece por painel_vendas (e/ou leads com busca do lead) e analise com o manual abaixo. Não responda só com números: diga onde o funil vaza, por que (com base no manual) e o que cada pessoa faz hoje.

Manual (Base de Vendas — fonte única, editável em Configurações → Base de Vendas; a mesma usada pelo Copiloto de Vendas nas sugestões ao vivo):

{{BASE_VENDAS}}
`

const SYSTEM_PROMPT_SUFFIX = `**Como analisar vendas:**
- Placar vs meta, com ritmo projetado pro fim do mês e quanto falta por semana.
- Onde o funil vaza: compare as passagens da coorte (lead → contato → reunião → proposta → ganho) com as metas e o histórico (~16% reunião → fechamento). Aponte a etapa com a maior queda e a causa provável pelo manual.
- Por responsável: quem tem lead sem contato, próxima ação vencida, lead parado; quem converte. Cite nomes.
- Por origem: qual traz lead que fecha, não só volume.
- Motivos de perda: ligue cada um à objeção do manual e diga o que muda. Se a maioria está "Parou de responder" ou sem motivo, isso é falha de follow-up/registro, diga isso.
- Lead individual: diga em que etapa está, o que falta da qualificação (nicho, 3 sinais de caixa, decisor/segundo decisor), a temperatura BANT, a objeção que aparece nas anotações, qual prova social usar e a PRÓXIMA AÇÃO com prazo. Se pedirem, escreva a mensagem de WhatsApp: português curto, de dono pra dono, sem jargão, sem travessão, uma pergunta só, sem preço (se for mensagem de SDR), citando algo específico do lead.
- Lista de ação: termine com quem faz o quê hoje, em ordem de dinheiro em jogo (leads quentes e propostas primeiro).
- O CRM só sabe o que foi registrado. Se faltam dados (BANT vazio, reunião não registrada no histórico, motivo de perda vazio, valor estimado vazio), diga o que a equipe precisa começar a preencher; não invente.

Seja direto, objetivo e profissional. Responda sempre em português brasileiro. Nunca invente dados — use só o que veio do contexto ou das ferramentas; se uma ferramenta falhar, diga qual dado faltou.

Formatação: sua resposta é renderizada como Markdown num painel de chat estreito (~380px). Pode usar **negrito**, listas e tabelas quando ajudar a organizar números — mas prefira tabelas pequenas (2-3 colunas) e evite parágrafos longos ou títulos grandes (##/###); um resumo direto costuma funcionar melhor que uma tabela gigante.`

/** Junta as duas partes fixas com o bloco da Base de Vendas (ver
 *  api/_lib/baseVendas.js) no meio — único lugar que monta o prompt
 *  completo do Archer. */
function buildArcherSystemPrompt(baseVendasText) {
  return SYSTEM_PROMPT_PREFIX.replace('{{BASE_VENDAS}}', baseVendasText) + '\n' + SYSTEM_PROMPT_SUFFIX
}

const TOOLS = [
  {
    name: 'listar_clientes',
    description:
      'Lista os clientes da agência com status, serviços contratados e se têm conta de Google Ads e/ou Meta Ads configurada. Use pra descobrir o nome certo de um cliente ou ver a carteira.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'detalhes_cliente',
    description:
      'Ficha COMPLETA de um cliente: cadastro, responsáveis na agência, valor mensal, anotações, Briefing de Tráfego Pago e Briefing de Social Media inteiros (campos vazios não aparecem = ainda não preenchidos), Planejamento de Campanha, Funil Comercial, notas de Sucesso do Cliente e últimas otimizações.',
    input_schema: {
      type: 'object',
      properties: { cliente: { type: 'string', description: 'Nome do cliente (pode ser parcial).' } },
      required: ['cliente'],
      additionalProperties: false,
    },
  },
  {
    name: 'google_ads',
    description:
      'Dados reais do Google Ads de um cliente. relatorio: "campanhas" (totais e por campanha), "palavras_chave" (por palavra-chave, com correspondência e índice de qualidade) ou "termos_de_pesquisa" (o que as pessoas digitaram, com status: ADDED = já é palavra-chave, EXCLUDED = já negativado, NONE = nenhum). Ordenado por custo. Período padrão: últimos 30 dias até ontem.',
    input_schema: {
      type: 'object',
      properties: {
        cliente: { type: 'string', description: 'Nome do cliente (pode ser parcial).' },
        relatorio: { type: 'string', enum: ['campanhas', 'palavras_chave', 'termos_de_pesquisa'] },
        dias: { type: 'integer', description: 'Últimos N dias até ontem (1 a 365). Ignorado se data_inicio/data_fim forem enviados.' },
        data_inicio: { type: 'string', description: 'yyyy-MM-dd' },
        data_fim: { type: 'string', description: 'yyyy-MM-dd' },
        limite: { type: 'integer', description: 'Máximo de linhas em palavras_chave/termos_de_pesquisa (padrão 60, máximo 200).' },
      },
      required: ['cliente', 'relatorio'],
      additionalProperties: false,
    },
  },
  {
    name: 'meta_ads',
    description:
      'Dados reais do Meta Ads (Facebook/Instagram) de um cliente. nivel: "conta" (totais), "campanhas", "conjuntos" ou "anuncios" — com investido, alcance, frequência, CTR, CPC, CPM, conversas iniciadas e custo por conversa. Ordenado por gasto. Período padrão: últimos 30 dias até ontem.',
    input_schema: {
      type: 'object',
      properties: {
        cliente: { type: 'string', description: 'Nome do cliente (pode ser parcial).' },
        nivel: { type: 'string', enum: ['conta', 'campanhas', 'conjuntos', 'anuncios'] },
        dias: { type: 'integer', description: 'Últimos N dias até ontem (1 a 365). Ignorado se data_inicio/data_fim forem enviados.' },
        data_inicio: { type: 'string', description: 'yyyy-MM-dd' },
        data_fim: { type: 'string', description: 'yyyy-MM-dd' },
      },
      required: ['cliente', 'nivel'],
      additionalProperties: false,
    },
  },
]

// Ferramentas que leem/escrevem o próprio CRM (tarefas, leads, reuniões,
// briefings...) ficam em api/_lib/archerCrm.js.
const ALL_TOOLS = [...TOOLS, ...CRM_TOOLS]

const TOOL_LABEL = {
  listar_clientes: 'lista de clientes',
  detalhes_cliente: 'ficha do cliente',
  google_ads: 'Google Ads',
  meta_ads: 'Meta Ads',
}

// ---------------------------------------------------------------- datas

/** yyyy-MM-dd no fuso de São Paulo (o "ontem" do Google/Meta é o da conta, no Brasil). */
function isoInSaoPaulo(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

function resolvePeriod(input) {
  if (input.data_inicio && input.data_fim && DATE_RE.test(input.data_inicio) && DATE_RE.test(input.data_fim)) {
    return { dateFrom: input.data_inicio, dateTo: input.data_fim }
  }
  const days = Math.min(365, Math.max(1, Number(input.dias) || 30))
  const to = new Date(Date.now() - 24 * 3600 * 1000)
  const from = new Date(to.getTime() - (days - 1) * 24 * 3600 * 1000)
  return { dateFrom: isoInSaoPaulo(from), dateTo: isoInSaoPaulo(to) }
}

// ---------------------------------------------------------------- ferramentas

const activeModules = (c) =>
  Object.entries(c.modules || {})
    .filter(([, v]) => v)
    .map(([k]) => k)

async function toolListClients(dir) {
  const clients = await dir.clients()
  return clients
    .filter((c) => c.status !== 'churned')
    .map((c) => ({
      cliente: c.companyName,
      status: c.status,
      segmento: c.segment || null,
      servicos: activeModules(c),
      valorMensal: c.monthlyValue ?? null,
      temGoogleAds: !!c.campaignPlanning?.acessos?.googleAdsAccountId,
      temMetaAds: !!c.campaignPlanning?.acessos?.metaAdsAccountId,
      briefingTrafegoPreenchido: !!c.paidTrafficBriefing?.filledAt,
      briefingSocialPreenchido: !!c.briefing?.filledAt,
    }))
}

async function toolGoogleAds(dir, input, googleToken) {
  const c = await dir.find(input.cliente)
  const customerId = String(c.campaignPlanning?.acessos?.googleAdsAccountId || '').replace(/\D/g, '')
  if (!customerId) throw new Error(`${c.companyName} não tem conta do Google Ads configurada no Planejamento de Campanha.`)
  if (!hasGoogleAdsCredentials()) throw new Error('Credenciais do Google Ads não configuradas no servidor.')

  const { dateFrom, dateTo } = resolvePeriod(input)
  const level = input.relatorio === 'palavras_chave' ? 'keywords' : input.relatorio === 'termos_de_pesquisa' ? 'search_terms' : 'campaign'
  const limit = Math.min(200, Math.max(10, Number(input.limite) || 60))
  const token = await googleToken()
  const result = await runGoogleAdsQuery(token, customerId, buildQuery(dateFrom, dateTo, level, { limit, detailed: true }), 'ai/chat')
  if (!result.ok) throw new Error(`Google Ads: ${extractErrorMessage(result)}`)

  const rows = result.data.results ?? []
  const base = { cliente: c.companyName, periodo: { de: dateFrom, ate: dateTo } }
  if (level === 'keywords') return { ...base, palavrasChave: mapKeywordRows(rows) }
  if (level === 'search_terms') return { ...base, termosDePesquisa: mapSearchTermRows(rows) }
  const { summary, campaigns } = aggregateResults(rows)
  return { ...base, totais: summary, campanhas: campaigns }
}

async function toolMetaAds(dir, input) {
  const c = await dir.find(input.cliente)
  const accountId = normalizeAccountId(c.campaignPlanning?.acessos?.metaAdsAccountId)
  if (!accountId) throw new Error(`${c.companyName} não tem conta do Meta Ads configurada no Planejamento de Campanha.`)
  const resolved = await resolveMetaToken(c.id)
  if (!resolved) throw new Error('Nenhum token do Meta Ads disponível pra esse cliente.')

  const { dateFrom, dateTo } = resolvePeriod(input)
  const base = { cliente: c.companyName, periodo: { de: dateFrom, ate: dateTo } }
  if (input.nivel === 'conta') {
    const { totals } = await fetchAccountInsights(resolved.token, accountId, dateFrom, dateTo)
    return { ...base, totais: { ...totals, custoPorConversa: totals.conversations > 0 ? totals.spend / totals.conversations : null } }
  }
  const level = input.nivel === 'conjuntos' ? 'adset' : input.nivel === 'anuncios' ? 'ad' : 'campaign'
  return { ...base, [input.nivel]: await fetchLevelInsights(resolved.token, accountId, dateFrom, dateTo, level) }
}

async function runTool(name, input, deps) {
  switch (name) {
    case 'listar_clientes':
      return toolListClients(deps.dir)
    case 'detalhes_cliente':
      return toolClientDetails(deps.dir, input)
    case 'google_ads':
      return toolGoogleAds(deps.dir, input, deps.googleToken)
    case 'meta_ads':
      return toolMetaAds(deps.dir, input)
    case 'resumo_agencia':
      return toolAgencyOverview(deps.dir)
    case 'tarefas':
      return toolTasks(deps.dir, input)
    case 'leads':
      return toolLeads(deps.dir, input)
    case 'painel_vendas':
      return toolSalesDashboard(deps.dir, input)
    case 'mover_lead':
      return toolMoveLead(deps, input)
    case 'preencher_bant':
      return toolWriteBant(deps, input)
    case 'reunioes':
      return toolMeetings(deps.dir, input)
    case 'conteudos':
      return toolContents(deps.dir, input)
    case 'otimizacoes':
      return toolOptimizations(deps.dir, input)
    case 'preencher_briefing_trafego':
      return toolWritePaidTrafficBriefing(deps, input)
    case 'preencher_briefing_social':
      return toolWriteSocialBriefing(deps, input)
    default:
      throw new Error(`Ferramenta desconhecida: ${name}`)
  }
}

// ---------------------------------------------------------------- loop

function pageContextBlock(context) {
  const today = isoInSaoPaulo(new Date())
  const lines = [`Hoje é ${today} (horário de Brasília).`]
  if (context) {
    lines.push(
      `Contexto da página que o usuário está vendo (${context.label || context.type || 'desconhecida'}), em JSON:`,
      JSON.stringify(context.data ?? {}, null, 2)
    )
  }
  return lines.join('\n')
}

/** Conversa com o modelo executando as ferramentas que ele pedir, até ele
 *  responder em texto (ou acabar o limite de rodadas/tempo). */
export async function runArcher({ message, context, history, user }) {
  const client = new Anthropic({ timeout: 60_000, maxRetries: 1 })
  const startedAt = Date.now()
  const dir = createCrmDirectory()
  let googleTokenPromise = null
  const deps = { dir, user, googleToken: () => (googleTokenPromise ??= getAccessToken()) }

  // Base de Vendas (fonte única, ver api/_lib/baseVendas.js) entra dentro do
  // bloco cacheado — o cache da Anthropic é por conteúdo, então só invalida
  // quando alguém edita a Base de Vendas em Configurações.
  const baseVendasText = formatBaseVendasForPrompt(await getBaseVendas())
  const system = [
    { type: 'text', text: buildArcherSystemPrompt(baseVendasText), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: pageContextBlock(context) },
  ]
  const messages = [...history, { role: 'user', content: message }]
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 }
  const toolsUsed = new Set()

  for (let round = 0; ; round++) {
    const outOfRounds = round >= MAX_TOOL_ROUNDS || Date.now() - startedAt > TOTAL_BUDGET_MS - 30_000
    const response = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 8000,
      system,
      tools: ALL_TOOLS,
      // Última rodada: proíbe novas consultas e força a resposta com o que já tem.
      // (As ferramentas continuam declaradas — o histórico já tem tool_use/tool_result.)
      ...(outOfRounds ? { tool_choice: { type: 'none' } } : {}),
      messages: outOfRounds
        ? [...messages, { role: 'user', content: 'Limite de consultas atingido: responda agora com os dados que já buscou.' }]
        : messages,
    })
    usage.input_tokens += response.usage.input_tokens || 0
    usage.output_tokens += response.usage.output_tokens || 0
    usage.cache_read_input_tokens += response.usage.cache_read_input_tokens || 0

    if (response.stop_reason === 'refusal') {
      return { text: 'Não consigo ajudar com esse pedido.', usage, toolsUsed: [...toolsUsed] }
    }

    if (response.stop_reason !== 'tool_use' || outOfRounds) {
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n\n')
        .trim()
      const cut = response.stop_reason === 'max_tokens' ? '\n\n_(resposta cortada por tamanho — peça pra continuar)_' : ''
      return { text: (text || 'Não consegui montar uma resposta. Tenta reformular a pergunta.') + cut, usage, toolsUsed: [...toolsUsed] }
    }

    // Executa todas as ferramentas pedidas nesta rodada em paralelo e devolve
    // todos os resultados numa única mensagem.
    messages.push({ role: 'assistant', content: response.content })
    const calls = response.content.filter((b) => b.type === 'tool_use')
    const results = await Promise.all(
      calls.map(async (call) => {
        toolsUsed.add(TOOL_LABEL[call.name] || CRM_TOOL_LABEL[call.name] || call.name)
        try {
          const data = await runTool(call.name, call.input || {}, deps)
          return { type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(data) }
        } catch (err) {
          console.warn(`[ai/chat] ferramenta ${call.name} falhou:`, err.message)
          return { type: 'tool_result', tool_use_id: call.id, content: `Erro: ${err.message}`, is_error: true }
        }
      })
    )
    messages.push({ role: 'user', content: results })
  }
}

// ---------------------------------------------------------------- limite diário

function todayKey() {
  return new Date().toISOString().slice(0, 10) // yyyy-MM-dd (UTC — suficiente pro limite diário, não precisa ser exato ao fuso)
}

/** Quantas mensagens o usuário já mandou hoje (sem contar esta). */
async function getDailyUsage(uid) {
  const snap = await getDoc(`aiUsage/${uid}_${todayKey()}`)
  return snap.exists ? snap.data()?.count || 0 : 0
}

/** Nunca mostra mais que o limite (tentativas depois de bater o limite
 *  também incrementam o contador, mas não viram mensagem). */
function quotaOf(used) {
  return { used: Math.min(used, DAILY_MESSAGE_LIMIT), limit: DAILY_MESSAGE_LIMIT }
}

/** Lê e incrementa o contador de mensagens do dia pra esse usuário. Feito
 *  com get+set (não é uma transação atômica de verdade — duas mensagens no
 *  mesmíssimo instante poderiam raramente passar do limite por 1, o que é
 *  aceitável pra um controle de custo, não uma trava de segurança). */
async function incrementDailyUsage(uid) {
  const docPath = `aiUsage/${uid}_${todayKey()}`
  const snap = await getDoc(docPath)
  const current = snap.exists ? snap.data()?.count || 0 : 0
  const next = current + 1
  await setDoc(docPath, { userId: uid, date: todayKey(), count: next })
  return next
}

/** POST /api/ai/sugestao { leadId, pergunta?, transcricaoRecente, resumoAnterior? }
 *  -> streaming (text/plain). Ver api/_lib/copilotoSugestao.js. */
async function handleSugestao(req, res, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  // Mesma lista fixa do Firestore (isCopiloto()) e da página /copiloto —
  // por e-mail, não por role (ver api/_lib/copilotoAccess.js).
  if (!temAcessoAoCopiloto(user.email)) {
    return res.status(403).json({ error: 'Sem permissão para usar o Copiloto de Vendas' })
  }
  const { leadId, pergunta, transcricaoRecente, resumoAnterior } = req.body || {}
  await runCopilotoSugestao({ leadId, pergunta, transcricaoRecente, resumoAnterior }, res)
}

/** POST /api/ai/transcrever { audioBase64, mimeType } -> { text }. Ver
 *  api/_lib/groqWhisper.js. 429 do Groq vira { error, retryAfterSec } pro
 *  navegador esperar e reenviar o mesmo trecho (ver utils/groqRateLimiter.ts). */
async function handleTranscrever(req, res, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!temAcessoAoCopiloto(user.email)) {
    return res.status(403).json({ error: 'Sem permissão para usar o Copiloto de Vendas' })
  }
  const { audioBase64, mimeType } = req.body || {}
  if (!audioBase64 || typeof audioBase64 !== 'string') {
    return res.status(400).json({ error: 'audioBase64 é obrigatório' })
  }
  try {
    const buffer = Buffer.from(audioBase64, 'base64')
    const text = await transcribeWithGroq(buffer, mimeType || 'audio/wav')
    return res.status(200).json({ text })
  } catch (err) {
    if (err instanceof GroqRateLimitError) {
      return res.status(429).json({ error: err.message, retryAfterSec: err.retryAfterSec })
    }
    console.error('[ai/transcrever] falha ao transcrever:', err.message)
    return res.status(502).json({ error: err.message || 'Falha ao transcrever o áudio' })
  }
}

/** POST /api/ai/resumo { leadId, blocos, sugestoes } -> { resumo }. Ver
 *  api/_lib/copilotoResumo.js. Chamado automaticamente ao encerrar a chamada
 *  e por "Gerar resumo agora" (LeadChamadasTab). */
async function handleResumo(req, res, user) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!temAcessoAoCopiloto(user.email)) {
    return res.status(403).json({ error: 'Sem permissão para usar o Copiloto de Vendas' })
  }
  const { leadId, blocos, sugestoes } = req.body || {}
  if (!leadId || typeof leadId !== 'string' || !Array.isArray(blocos)) {
    return res.status(400).json({ error: 'leadId e blocos são obrigatórios' })
  }
  try {
    const resumo = await runCopilotoResumo({ leadId, blocos, sugestoes: Array.isArray(sugestoes) ? sugestoes : [] })
    return res.status(200).json({ resumo })
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error('[ai/resumo] Anthropic API error:', err.status, err.message)
      return res.status(502).json({ error: err.message || 'Falha ao gerar o resumo' })
    }
    console.error('[ai/resumo] falha ao gerar resumo:', err.message)
    return res.status(502).json({ error: err.message || 'Falha ao gerar o resumo' })
  }
}

async function handler(req, res, user) {
  // Mesmo arquivo (não uma rota nova) porque o projeto está no limite de
  // Functions do plano da Vercel.
  if (req.query.acao === 'sugestao') return handleSugestao(req, res, user)
  if (req.query.acao === 'transcrever') return handleTranscrever(req, res, user)
  if (req.query.acao === 'resumo') return handleResumo(req, res, user)

  if (req.method === 'GET') {
    try {
      return res.status(200).json({ quota: quotaOf(await getDailyUsage(user.uid)) })
    } catch (err) {
      console.error('[ai/chat] falha ao ler o uso do dia', err)
      return res.status(500).json({ error: 'Não foi possível ler o uso de hoje' })
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor' })
  }

  const { message, context, history } = req.body || {}
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message é obrigatório' })
  }

  let quota
  try {
    const usageCount = await incrementDailyUsage(user.uid)
    quota = quotaOf(usageCount)
    if (usageCount > DAILY_MESSAGE_LIMIT) {
      return res.status(429).json({ error: 'Limite diário de mensagens atingido. Tente novamente amanhã.', quota })
    }
  } catch (err) {
    console.error('[ai/chat] falha ao checar limite de uso — segue sem bloquear', err)
  }

  const cleanHistory = Array.isArray(history)
    ? history
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content }))
    : []

  try {
    const { text, usage, toolsUsed } = await runArcher({ message, context, history: cleanHistory, user })
    return res.status(200).json({ response: text, usage, quota, toolsUsed })
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error('[ai/chat] Anthropic API error:', err.status, err.message)
      return res.status(502).json({ error: err.message || 'Falha ao consultar o assistente de IA' })
    }
    console.error('[ai/chat] erro inesperado:', err)
    return res.status(500).json({ error: `Erro interno: ${err?.message || 'desconhecido'}` })
  }
}

// Origem fixa da extensão do Chrome do Copiloto (manifest.json em /extensao
// tem uma "key" pinada, então o ID da extensão é sempre este, em qualquer
// máquina que carregar o mesmo manifest — ver extensao/README.md). As
// chamadas da página /copiloto do próprio CRM são same-origin e não passam
// por aqui (o navegador só manda preflight em requisição cross-origin).
const EXTENSAO_ORIGIN = 'chrome-extension://cpajbjjkaphacinbmoeininpgocjgmoj'

function withExtensaoCors(handler) {
  return async (req, res) => {
    if (req.headers.origin === EXTENSAO_ORIGIN) {
      res.setHeader('Access-Control-Allow-Origin', EXTENSAO_ORIGIN)
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.setHeader('Vary', 'Origin')
    }
    if (req.method === 'OPTIONS') return res.status(204).end()
    return handler(req, res)
  }
}

export default withExtensaoCors(withInternalAuth(handler))
