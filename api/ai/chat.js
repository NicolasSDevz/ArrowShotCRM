// Vercel Function — /api/ai/chat
//
// Assistente de IA do Quiver (botão flutuante, ver src/components/ai/). Só
// usuário interno autenticado (ver api/_lib/auth.js) — nunca exposto sem
// login. A API key da Anthropic só existe aqui no servidor
// (process.env.ANTHROPIC_API_KEY), nunca no frontend.
//
// POST /api/ai/chat { message, context, history } -> { response, usage }

import { withInternalAuth } from '../_lib/auth.js'
import { getDoc, setDoc } from '../_lib/firebaseAdmin.js'

const ANTHROPIC_MODEL = 'claude-sonnet-5'
const DAILY_MESSAGE_LIMIT = 50

const TEAM_INFO = `Equipe da agência:
- Bruno: sócio e closer (vendas)
- Jamilson: customer success (CS)
- Ciane: gestora de tráfego e social mídia
- Nicolas: gestor de tráfego e social mídia`

const BASE_SYSTEM_PROMPT = `Você é o assistente de IA do Quiver, uma plataforma de gestão para a Arrow Shot, agência de marketing digital especializada no nicho de limpeza e facilities.

Você tem acesso ao contexto da plataforma e pode ajudar a equipe com:
- Análise de performance de campanhas (Meta Ads e Google Ads)
- Sugestões de otimização baseadas nos dados
- Resumo de clientes e histórico
- Interpretação de métricas e KPIs
- Estratégias de marketing para o nicho de limpeza

${TEAM_INFO}

Seja direto, objetivo e use linguagem profissional mas acessível. Quando tiver dados reais disponíveis no contexto, use-os. Quando não tiver, diga claramente e sugira como obter os dados.`

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
async function incrementDailyUsage(uid) {
  const docPath = `aiUsage/${uid}_${todayKey()}`
  const snap = await getDoc(docPath)
  const current = snap.exists ? snap.data()?.count || 0 : 0
  const next = current + 1
  await setDoc(docPath, { userId: uid, date: todayKey(), count: next })
  return next
}

async function handler(req, res, user) {
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

  try {
    const usageCount = await incrementDailyUsage(user.uid)
    if (usageCount > DAILY_MESSAGE_LIMIT) {
      return res.status(429).json({ error: 'Limite diário de mensagens atingido. Tente novamente amanhã.' })
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
        max_tokens: 1000,
        system: buildSystemPrompt(context),
        messages: [...cleanHistory, { role: 'user', content: message }],
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('[ai/chat] Anthropic API error:', data)
      return res.status(502).json({ error: data?.error?.message || 'Falha ao consultar o assistente de IA' })
    }

    const text = data.content?.find((block) => block.type === 'text')?.text || ''
    return res.status(200).json({ response: text, usage: data.usage })
  } catch (err) {
    console.error('[ai/chat] erro inesperado:', err)
    return res.status(500).json({ error: `Erro interno: ${err?.message || 'desconhecido'}` })
  }
}

export default withInternalAuth(handler)
