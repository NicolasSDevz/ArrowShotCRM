// Resumo pós-chamada do Copiloto de Vendas (Etapa 3) — api/ai?acao=resumo
// (ver vercel.json). Mesmo arquivo da Vercel Function do Archer/Copiloto —
// nenhuma rota nova (limite de Functions do plano Hobby).
//
// Diferente da sugestão ao vivo (Haiku, streaming, texto livre curto): aqui
// é Claude Sonnet, uma resposta só ao final da chamada, com os 7 campos
// garantidos via tool use forçado (tool_choice) — mais confiável que
// parsear texto livre pra 7 campos, alguns multi-linha.

import Anthropic from '@anthropic-ai/sdk'
import { getDoc } from './firebaseAdmin.js'
import { getBaseVendas, formatBaseVendasForPrompt } from './baseVendas.js'
import { leadContextBlock } from './leadContext.js'

const SONNET_MODEL = 'claude-sonnet-5-5'
const MAX_TOKENS = 1800

const RESUMO_SYSTEM_PREFIX = `Você é o copiloto de vendas da Arrow Shot, agência de marketing exclusiva para empresas de limpeza. A chamada de vendas acabou de terminar — sua tarefa é resumi-la pro Bruno a partir da transcrição completa.

Regra principal: use SÓ o que foi dito na chamada. Nunca invente, suponha ou complete com informação de fora da transcrição. Campo que não foi abordado: escreva exatamente "não mencionado" (não deixe vazio, não chute).

A mensagem de follow-up deve soar como o próprio Bruno escrevendo no WhatsApp pro cliente: direta, em português do Brasil, sem jargão de marketing, citando a dor principal levantada e o próximo passo combinado — sem emoji em excesso, sem parecer automática.

Temperatura: quente (fechamento próximo ou já decidido), morno (interesse real mas falta algo — orçamento, decisor, tempo), frio (sem engajamento real ou fora do perfil). Justifique em uma linha com base no que foi dito.

Base de Vendas (contexto da agência, pra avaliar se o que foi discutido faz sentido):
`

const RESUMO_TOOL = {
  name: 'registrar_resumo',
  description: 'Registra o resumo estruturado da chamada de vendas que acabou de terminar.',
  input_schema: {
    type: 'object',
    properties: {
      dores: { type: 'string', description: 'Dores do cliente levantadas na chamada, ou "não mencionado".' },
      situacao_atual: {
        type: 'string',
        description:
          'Região, serviços que oferece, tamanho da equipe, como os clientes chegam hoje, quem atende o WhatsApp, se já investe em anúncios e quanto — só o que foi dito; "não mencionado" pro que faltou.',
      },
      objecoes: {
        type: 'string',
        description: 'Objeções levantadas pelo cliente e como o Bruno respondeu — e quais ficaram sem resposta. "não mencionado" se não houve objeção.',
      },
      temperatura: { type: 'string', enum: ['quente', 'morno', 'frio'] },
      temperatura_justificativa: { type: 'string', description: 'Uma linha justificando a temperatura, com base no que foi dito.' },
      plano_ou_valor: { type: 'string', description: 'Plano ou valor discutido na chamada, ou "não mencionado".' },
      proximos_passos: { type: 'string', description: 'Próximos passos combinados, ou "não mencionado".' },
      proximo_passo_data: {
        type: 'string',
        description: 'Data combinada pro próximo passo, formato yyyy-MM-dd. Omita este campo se nenhuma data concreta foi combinada.',
      },
      follow_up_mensagem: { type: 'string', description: 'Mensagem de follow-up pronta pra copiar e colar no WhatsApp, no tom do Bruno.' },
    },
    required: ['dores', 'situacao_atual', 'objecoes', 'temperatura', 'temperatura_justificativa', 'plano_ou_valor', 'proximos_passos', 'follow_up_mensagem'],
    additionalProperties: false,
  },
}

function formatBlocoTime(ms) {
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function formatTranscricao(blocos) {
  if (!Array.isArray(blocos) || blocos.length === 0) return '(nenhuma fala transcrita nesta chamada)'
  return blocos.map((b) => `[${formatBlocoTime(b.timestampMs)}] ${b.speaker}: ${b.texto}`).join('\n')
}

function formatSugestoes(sugestoes) {
  if (!Array.isArray(sugestoes) || sugestoes.length === 0) return '(nenhuma sugestão gerada durante a chamada)'
  return sugestoes
    .map((s, i) => `${i + 1}. [${s.tipo}] ${s.resumo}${s.frases?.length ? ` — frases sugeridas: ${s.frases.join(' / ')}` : ''}`)
    .join('\n')
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Gera o resumo estruturado — chamado tanto automaticamente ao encerrar
 *  (CopilotoPage) quanto por "Gerar resumo agora" (LeadChamadasTab, quando a
 *  chamada terminou sem resumo — aba fechada, erro etc.). */
export async function runCopilotoResumo({ leadId, blocos, sugestoes }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não configurada no servidor')
  }

  const [leadDoc, baseVendas] = await Promise.all([getDoc(`leads/${leadId}`), getBaseVendas()])
  const lead = leadDoc.exists ? leadDoc.data() : null

  const system = [
    { type: 'text', text: RESUMO_SYSTEM_PREFIX + formatBaseVendasForPrompt(baseVendas), cache_control: { type: 'ephemeral' } },
  ]

  const userContent = [
    '## Contexto do lead',
    leadContextBlock(lead),
    '\n## Transcrição completa da chamada',
    formatTranscricao(blocos),
    '\n## Sugestões geradas durante a chamada',
    formatSugestoes(sugestoes),
    '\n## Tarefa',
    'Preencha o resumo estruturado chamando registrar_resumo. Só use o que está na transcrição acima.',
  ].join('\n')

  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 })
  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    tools: [RESUMO_TOOL],
    tool_choice: { type: 'tool', name: 'registrar_resumo' },
    messages: [{ role: 'user', content: userContent }],
  })

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  if (!toolUse) throw new Error('O modelo não retornou o resumo estruturado')
  const input = toolUse.input || {}

  const proximoPassoData = typeof input.proximo_passo_data === 'string' && DATE_RE.test(input.proximo_passo_data) ? input.proximo_passo_data : null

  return {
    dores: input.dores || 'não mencionado',
    situacaoAtual: input.situacao_atual || 'não mencionado',
    objecoes: input.objecoes || 'não mencionado',
    temperatura: ['quente', 'morno', 'frio'].includes(input.temperatura) ? input.temperatura : 'morno',
    temperaturaJustificativa: input.temperatura_justificativa || '',
    planoOuValor: input.plano_ou_valor || 'não mencionado',
    proximosPassos: input.proximos_passos || 'não mencionado',
    proximoPassoData,
    followUpMensagem: input.follow_up_mensagem || '',
  }
}
