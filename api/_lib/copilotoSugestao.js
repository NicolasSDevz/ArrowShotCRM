// Sugestões ao vivo do Copiloto de Vendas (Etapa 2) — api/ai?acao=sugestao
// (ver vercel.json). Mesmo arquivo da Vercel Function do Archer (api/ai/
// index.js importa runCopilotoSugestao) — o projeto está no limite de
// Functions do plano Hobby, nenhuma rota nova.
//
// Usa Claude Haiku (rápido/barato — gerado várias vezes por chamada) e
// responde em STREAMING, escrevendo direto na resposta HTTP: é o primeiro
// endpoint deste projeto que faz isso, mas a Node Function da Vercel aceita
// `res.write()` normalmente (não é Edge Function).
//
// A Base de Vendas (ver baseVendas.js) é a MESMA fonte usada pelo Archer —
// nunca duplicada aqui.

import Anthropic from '@anthropic-ai/sdk'
import { getDoc } from './firebaseAdmin.js'
import { getBaseVendas, formatBaseVendasForPrompt } from './baseVendas.js'
import { leadContextBlock } from './leadContext.js'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 300

const SUGESTAO_SYSTEM_PREFIX = `Você é o copiloto de vendas da Arrow Shot, agência de marketing exclusiva para empresas de limpeza. Ajude o Bruno a responder com segurança, em português do Brasil, tom consultivo e direto. Use vieses de forma ética (ancoragem, enquadramento, aversão à perda, prova social, autoridade, reciprocidade): só apresentar melhor o que é verdade. Nunca inventar números, cases, depoimentos, escassez falsa ou desconto falso. Nunca prometer resultado garantido. Use apenas informações da Base de Vendas abaixo; se a resposta não estiver lá, sugira que o Bruno confirme depois com o cliente.

Base de Vendas:
`

const SUGESTAO_FORMAT_INSTRUCTIONS = `

Responda SEMPRE e SÓ neste formato, sem nada antes ou depois, sem markdown:
TIPO: Objeção | Dúvida | Sinal de compra | Geral
RESUMO: o que o cliente quis dizer, em uma linha
FRASE: primeira frase pronta pro Bruno falar
FRASE: segunda frase pronta (opcional — omita esta segunda linha "FRASE:" se só precisar de uma)`

/** Gera uma sugestão e escreve a resposta em streaming direto em `res`
 *  (texto puro, chunk a chunk) — chama `res.end()` ao terminar. O chamador
 *  (handler de api/ai/index.js) já validou o método e a autenticação. */
export async function runCopilotoSugestao({ leadId, pergunta, transcricaoRecente, resumoAnterior }, res) {
  if (!leadId || typeof leadId !== 'string') {
    res.status(400).json({ error: 'leadId é obrigatório' })
    return
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor' })
    return
  }

  const [leadDoc, baseVendas] = await Promise.all([getDoc(`leads/${leadId}`), getBaseVendas()])
  const lead = leadDoc.exists ? leadDoc.data() : null

  const system = [
    {
      type: 'text',
      text: SUGESTAO_SYSTEM_PREFIX + formatBaseVendasForPrompt(baseVendas) + SUGESTAO_FORMAT_INSTRUCTIONS,
      cache_control: { type: 'ephemeral' },
    },
  ]

  const userContent = [
    '## Contexto do lead',
    leadContextBlock(lead),
    resumoAnterior ? `\n## O que já foi falado antes (resumo)\n${resumoAnterior}` : '',
    `\n## Transcrição recente (últimos ~3 min)\n${transcricaoRecente || '(sem fala transcrita ainda)'}`,
    `\n## Pergunta do Bruno\n${pergunta || '(nenhuma — gere a sugestão a partir do que o cliente acabou de dizer na transcrição recente)'}`,
  ]
    .filter(Boolean)
    .join('\n')

  const client = new Anthropic({ timeout: 30_000, maxRetries: 1 })

  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    // Desliga o buffer de proxies (ex: Vercel/Nginx na frente) que
    // esperariam a resposta inteira antes de entregar — sem isso o
    // streaming chegaria tudo de uma vez no fim, não ao vivo.
    'X-Accel-Buffering': 'no',
  })

  try {
    const stream = client.messages.stream({
      model: HAIKU_MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: userContent }],
    })
    stream.on('text', (delta) => res.write(delta))
    await stream.finalMessage()
  } catch (err) {
    console.error('[ai/sugestao] falha ao gerar sugestão:', err.message)
    // A resposta já começou (writeHead 200) — não dá mais pra mandar um
    // status de erro, então escreve um marcador que o frontend reconhece.
    res.write('\n[[ERRO]]')
  } finally {
    res.end()
  }
}
