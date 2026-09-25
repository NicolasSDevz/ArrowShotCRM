// Vercel Function — /api/ai/chat
//
// Assistente de IA do Quiver (botão flutuante, ver src/components/ai/). Só
// usuário interno autenticado (ver api/_lib/auth.js) — nunca exposto sem
// login. A API key da Anthropic só existe aqui no servidor
// (process.env.ANTHROPIC_API_KEY), nunca no frontend.
//
// POST /api/ai/chat { message, context, history } -> { response, usage, quota }
// GET  /api/ai/chat -> { quota: { used, limit } }  (quantas mensagens o usuário já usou hoje)

import { withInternalAuth } from '../_lib/auth.js'
import { getDoc, setDoc } from '../_lib/firebaseAdmin.js'

const ANTHROPIC_MODEL = 'claude-sonnet-5'
const DAILY_MESSAGE_LIMIT = 50

const BASE_SYSTEM_PROMPT = `Você é o Archer, assistente de IA do Quiver — plataforma de gestão da Arrow Shot, agência de marketing digital especializada no nicho de limpeza e facilities no Brasil.

Seu papel é ajudar a equipe da agência com:
- Análise de performance de campanhas (Meta Ads e Google Ads)
- Sugestões de otimização baseadas nos dados
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

Quando tiver dados reais no contexto, use-os para respostas precisas e personalizadas. Quando não tiver dados, seja honesto e sugira como obter as informações.

Quando o usuário pedir uma sugestão, otimização, análise ou opinião, sempre termine com uma conclusão concreta e acionável — nunca responda só com uma tabela ou lista de números sem interpretá-los. Se faltar um dado mais granular pra uma recomendação mais específica (ex: nível de palavra-chave ou termo de pesquisa), diga isso em uma frase curta e ainda assim dê a melhor recomendação possível com o que você tem (CPC, CTR, custo por conversão etc. já indicam pra onde olhar).

Seja direto, objetivo e profissional. Use linguagem clara e acessível. Responda sempre em português brasileiro. Nunca invente dados — use apenas o que está no contexto fornecido.

Formatação: sua resposta é renderizada como Markdown num painel de chat estreito (~380px). Pode usar **negrito**, listas e tabelas quando ajudar a organizar números — mas prefira tabelas pequenas (2-3 colunas) e evite parágrafos longos ou títulos grandes (##/###) demais para o espaço; um resumo direto costuma funcionar melhor que uma tabela gigante.`

function buildSystemPrompt(context) {
  if (!context) return BASE_SYSTEM_PROMPT
  return `${BASE_SYSTEM_PROMPT}

Contexto da página atual (${context.label || context.type || 'desconhecida'}), em JSON:
${JSON.stringify(context.data ?? {}, null, 2)}`
}

function todayKey() {
  return new Date().toISOString().slice(0, 10) // yyyy-MM-dd (UTC — suficiente pro limite diário, não precisa ser exato ao fuso)
}

/** Lê e incrementa o contador de mensagens do dia pra esse usuário. Retorna
 *  o novo total. Feito com get+set (não é uma transação atômica de verdade —
 *  duas mensagens no mesmíssimo instante poderiam raramente passar do
 *  limite por 1, o que é aceitável pra um controle de custo, não uma trava
 *  de segurança). */
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

async function incrementDailyUsage(uid) {
  const docPath = `aiUsage/${uid}_${todayKey()}`
  const snap = await getDoc(docPath)
  const current = snap.exists ? snap.data()?.count || 0 : 0
  const next = current + 1
  await setDoc(docPath, { userId: uid, date: todayKey(), count: next })
  return next
}

async function handler(req, res, user) {
  // Mesmo arquivo (não uma rota nova) porque o projeto está no limite de
  // Functions do plano da Vercel.
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
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map((m) => ({ role: m.role, content: m.content }))
    : []

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        system: buildSystemPrompt(context),
        messages: [...cleanHistory, { role: 'user', content: message }],
      }),
      // Sem timeout, uma resposta lenta da Anthropic prende a function até o
      // limite de execução do Vercel — o usuário só vê o Archer "digitando"
      // sem nunca responder, sem erro nenhum aparecer.
      signal: AbortSignal.timeout(45_000),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('[ai/chat] Anthropic API error:', data)
      return res.status(502).json({ error: data?.error?.message || 'Falha ao consultar o assistente de IA' })
    }

    const text = data.content?.find((block) => block.type === 'text')?.text || ''
    return res.status(200).json({ response: text, usage: data.usage, quota })
  } catch (err) {
    console.error('[ai/chat] erro inesperado:', err)
    return res.status(500).json({ error: `Erro interno: ${err?.message || 'desconhecido'}` })
  }
}

export default withInternalAuth(handler)
