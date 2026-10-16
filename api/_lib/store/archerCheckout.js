// Archer no checkout: recuperador de vendas da Loja.
//
//   1. Chat na página de pagamento (POST checkout-chat): tira dúvida do produto,
//      quebra objeção e leva a pessoa de volta ao pagamento. Fala só do produto
//      daquele checkout, com o que está cadastrado nele. Nunca dá desconto.
//   2. E-mails de recuperação (sendRecoveryEmails): quem abandonou o carrinho
//      recebe até 3 e-mails escritos pelo Archer (30 min, 1 dia e 3 dias depois),
//      com o link do checkout já preenchido e um link para parar de receber.
//
// Modelo rápido e barato (Haiku): resposta curta, sem ferramentas.

import Anthropic from '@anthropic-ai/sdk'
import { getDoc, updateDoc, listDocs } from '../firebaseAdmin.js'
import { emailBrandFor, emailConfigured, emailLayout, escapeHtml, getProduct, nowIso, pixDiscount, randomToken, rateLimit, sendMail } from './core.js'

const MODEL = 'claude-haiku-5-5'
/** Teto de mensagens do chat por dia na loja toda (custo da IA). */
const CHAT_DAILY_LIMIT = 1500

/** Configuração do Archer no produto (padrão: chat e e-mails ligados). */
export function archerConfig(product) {
  const a = product?.checkout?.archer || {}
  return { chat: a.chat !== false, emails: a.emails !== false, notes: String(a.notes || '').slice(0, 3000) }
}

let client = null
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

const brl = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Tudo o que o Archer pode dizer sobre o produto (só o que está cadastrado). */
function productBrief(product, { bumps = [], methods = null } = {}) {
  const c = product.checkout || {}
  const pix = pixDiscount(product)
  const lines = [
    `Produto: ${product.name}`,
    product.description ? `Descrição: ${String(product.description).slice(0, 2000)}` : null,
    `Preço: ${brl(product.price)}${product.comparePrice > product.price ? ` (de ${brl(product.comparePrice)})` : ''}`,
    pix ? `Pagando no Pix: ${pix}% de desconto (${brl(Math.round(product.price * (1 - pix / 100)))}).` : null,
    methods
      ? `Formas de pagamento: ${[methods.pix && 'Pix', methods.card && `cartão de crédito em até ${product.maxInstallments || 12}x`].filter(Boolean).join(' e ') || 'nenhuma no momento'}.`
      : null,
    Number(c.guaranteeDays) > 0 ? `Garantia: ${c.guaranteeDays} dias (pede o reembolso pela área de membros dentro do prazo).` : 'Garantia: não informada (não prometa garantia).',
    Array.isArray(c.benefits) && c.benefits.filter(Boolean).length ? `Benefícios:\n- ${c.benefits.filter(Boolean).slice(0, 8).join('\n- ')}` : null,
    Array.isArray(c.testimonials) && c.testimonials.some((t) => t?.text)
      ? `Depoimentos reais:\n${c.testimonials.filter((t) => t?.text).slice(0, 4).map((t) => `- "${String(t.text).slice(0, 300)}"${t.name ? ` (${t.name})` : ''}`).join('\n')}`
      : null,
    bumps.length ? `Ofertas extras no checkout: ${bumps.map((b) => `${b.name} por ${brl(b.price)}`).join('; ')}.` : null,
    'Entrega: depois do pagamento aprovado, o acesso é liberado e o link chega no e-mail informado no checkout. Pix do Mercado Pago e cartão aprovam na hora.',
    product.supportEmail ? `Suporte humano: ${product.supportEmail}` : null,
    archerConfig(product).notes ? `Informações extras do produtor (perguntas frequentes, objeções):\n${archerConfig(product).notes}` : null,
  ]
  return lines.filter(Boolean).join('\n')
}

const CHAT_RULES = `Você é o Archer, assistente de vendas da página de pagamento. Seu objetivo é ajudar a pessoa a terminar a compra com segurança.

Regras:
- Português do Brasil, tom humano, caloroso e direto. Respostas curtas: no máximo 3 frases (ou uma lista curta).
- Fale só deste produto e da compra. Assunto fora disso: diga com gentileza que só ajuda com a compra.
- Use apenas as informações abaixo. Se não souber, diga que não tem essa informação e indique o suporte (se houver). Nunca invente conteúdo, bônus, prazo, garantia ou resultado.
- Nunca ofereça desconto, cupom ou condição que não esteja abaixo. Se pedirem desconto, valorize o que já está incluso (e o desconto do Pix, se houver).
- Não prometa resultado garantido (financeiro, de saúde etc.).
- Nunca peça nem aceite dados de cartão, senha ou CPF no chat. O pagamento é feito só no formulário da página.
- Cartão recusado: explique o motivo em palavras simples e sugira conferir os dados, tentar outro cartão ou pagar no Pix (se disponível).
- Termine, quando fizer sentido, convidando a concluir o pagamento no formulário logo acima/ao lado. Sem pressão exagerada nem urgência falsa.
- Não use markdown pesado (sem títulos nem tabelas). Pode usar **negrito** pontual.`

/** Conversa do chat do checkout. messages: [{ role: 'user'|'assistant', content }]. */
export async function checkoutChat({ product, bumps, methods, messages, context = {}, ip }) {
  const ai = anthropic()
  if (!ai) throw Object.assign(new Error('O assistente está indisponível agora.'), { status: 503 })
  if (!(await rateLimit(`archer-chat:${ip}`, 40, 60 * 60_000))) throw Object.assign(new Error('Muitas mensagens seguidas. Espere alguns minutos.'), { status: 429 })
  if (!(await rateLimit('archer-chat-day', CHAT_DAILY_LIMIT, 24 * 60 * 60_000))) throw Object.assign(new Error('O assistente está indisponível agora.'), { status: 503 })

  const clean = (Array.isArray(messages) ? messages : [])
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 800) }))
  while (clean.length && clean[0].role !== 'user') clean.shift()
  if (!clean.length || clean[clean.length - 1].role !== 'user') throw Object.assign(new Error('Mensagem vazia'), { status: 400 })

  const situation = [
    context.firstName ? `Nome do cliente: ${String(context.firstName).slice(0, 40)}` : null,
    context.method ? `Forma de pagamento escolhida: ${context.method === 'card' ? 'cartão' : 'Pix'}` : null,
    context.total ? `Total no carrinho agora: ${brl(context.total)}` : null,
    context.refused ? `O cartão acabou de ser recusado: ${String(context.refused).slice(0, 200)}` : null,
  ].filter(Boolean)

  const res = await ai.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: [
      { type: 'text', text: `${CHAT_RULES}\n\n# Produto\n${productBrief(product, { bumps, methods })}`, cache_control: { type: 'ephemeral' } },
      ...(situation.length ? [{ type: 'text', text: `# Situação agora\n${situation.join('\n')}` }] : []),
    ],
    messages: clean,
  })
  const reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim()
  return { reply: reply || 'Desculpe, não consegui responder agora. Pode perguntar de novo?' }
}

/* --------------------------- e-mails de recuperação --------------------------- */

/** Quando sai cada e-mail: o 1º conta da última atividade no checkout; os outros, do 1º e-mail. */
const STEPS = [
  { after: 30 * 60_000, from: 'activity' },
  { after: 24 * 3600_000, from: 'first' },
  { after: 72 * 3600_000, from: 'first' },
]
/** Carrinho mais antigo que isso não começa a receber (não manda e-mail pra carrinho velho). */
const START_WITHIN_MS = 48 * 3600_000
const MAX_PER_SWEEP = 8

function situationOf(cart) {
  if (cart.orderStatus === 'pending') return 'gerou o Pix e não pagou'
  if (cart.orderStatus === 'refused') return 'tentou pagar e o pagamento foi recusado'
  return 'preencheu os dados no checkout e não finalizou'
}

/** Texto do e-mail escrito pelo Archer. Sem IA (ou se ela falhar), usa um modelo pronto. */
async function writeRecoveryEmail(product, cart, step) {
  const first = String(cart.name || '').trim().split(/\s+/)[0] || ''
  const fallback = [
    {
      subject: `${first ? `${first}, ` : ''}seu pedido de ${product.name} ficou pela metade`,
      paragraphs: [
        `Oi${first ? `, ${first}` : ''}! Vi que você começou a compra de ${product.name} e não chegou a finalizar.`,
        'Se ficou alguma dúvida ou deu algum problema no pagamento, é só responder este e-mail. Seus dados já estão preenchidos no link abaixo.',
      ],
    },
    {
      subject: `Ficou alguma dúvida sobre ${product.name}?`,
      paragraphs: [
        `Oi${first ? `, ${first}` : ''}! Passando para saber se ficou alguma dúvida sobre ${product.name}.`,
        'Responda este e-mail com o que precisar. Se quiser concluir, o link abaixo leva direto para o pagamento.',
      ],
    },
    {
      subject: `Último lembrete: ${product.name}`,
      paragraphs: [
        `Oi${first ? `, ${first}` : ''}! Este é o último lembrete sobre a sua compra de ${product.name}.`,
        'Se ainda fizer sentido para você, o link abaixo está com seus dados preenchidos. Depois disso, não mando mais e-mails sobre este pedido.',
      ],
    },
  ][step]
  const ai = anthropic()
  if (!ai) return fallback
  try {
    const res = await ai.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: `Você é o Archer e escreve e-mails curtos de recuperação de carrinho abandonado, em português do Brasil, tom humano e gentil (como uma pessoa da equipe escrevendo, não um robô de marketing).
Regras: no máximo 3 parágrafos curtos; sem desconto nem cupom; sem urgência falsa; sem prometer resultado; use só as informações do produto dadas; não invente bônus, prazo ou garantia; não coloque link nem assinatura (o botão e o rodapé já vão no e-mail); assunto com no máximo 60 caracteres, sem emoji em excesso.
E-mail ${step + 1} de 3: ${['lembrete gentil logo depois do abandono, oferecendo ajuda', 'um dia depois: responda a principal objeção provável e reforce o valor (benefícios, garantia, depoimento se houver)', 'três dias depois: último lembrete, curto, deixando claro que é o último'][step]}.
Responda APENAS com JSON: {"subject": "...", "paragraphs": ["...", "..."]}`,
      messages: [
        {
          role: 'user',
          content: `# Produto\n${productBrief(product)}\n\n# Cliente\nPrimeiro nome: ${first || '(sem nome)'}\nSituação: ${situationOf(cart)}\nValor do carrinho: ${brl(cart.amount)}`,
        },
      ],
    })
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    const subject = String(json.subject || '').trim().slice(0, 90)
    const paragraphs = (Array.isArray(json.paragraphs) ? json.paragraphs : []).map((p) => String(p).trim()).filter(Boolean).slice(0, 4)
    return subject && paragraphs.length ? { subject, paragraphs } : fallback
  } catch (err) {
    console.warn('[loja] archer e-mail:', err?.message)
    return fallback
  }
}

/** Link de volta ao checkout com os dados preenchidos e a origem marcada. */
function checkoutLink(origin, product, cart, step) {
  const qs = new URLSearchParams({ nome: cart.name || '', email: cart.email, utm_source: 'archer', utm_medium: 'email', utm_campaign: `recuperacao-${step + 1}` })
  if (cart.phone) qs.set('tel', cart.phone)
  return `${origin}/pay/${product.slug}?${qs}`
}

/** Manda os e-mails que estão na hora (no máximo 1 varredura a cada 5 min). */
export async function sendRecoveryEmails(origin, { force = false } = {}) {
  if (!emailConfigured()) return { skipped: 'email' }
  if (!force && !(await rateLimit('sweep-recovery', 1, 5 * 60_000))) return { skipped: true }
  const rows = (await listDocs('storeAbandoned')).filter((a) => !a.recoveredAt)
  const products = new Map()
  let sent = 0
  for (const cart of rows) {
    if (sent >= MAX_PER_SWEEP) break
    if (cart.recoveryStopped || cart.contactedAt) continue
    const done = Array.isArray(cart.recoveryEmails) ? cart.recoveryEmails : []
    const step = done.length
    if (step >= STEPS.length) continue
    const now = Date.now()
    const activity = new Date(cart.updatedAt).getTime()
    if (step === 0 && now - activity > START_WITHIN_MS) continue
    const base = STEPS[step].from === 'first' ? new Date(done[0]?.sentAt || cart.updatedAt).getTime() : activity
    if (now - base < STEPS[step].after) continue
    // Voltou ao checkout depois do último e-mail: espera parar de novo antes do próximo.
    if (step > 0 && now - activity < STEPS[0].after) continue

    if (!products.has(cart.productId)) products.set(cart.productId, await getProduct(cart.productId))
    const product = products.get(cart.productId)
    if (!product || product.status !== 'active' || !archerConfig(product).emails) continue

    // Marca antes de mandar: duas varreduras juntas não mandam o mesmo e-mail duas vezes.
    const key = cart.recoveryKey || randomToken(16)
    const entry = { step: step + 1, sentAt: nowIso(), subject: '' }
    await updateDoc(`storeAbandoned/${cart.id}`, { recoveryKey: key, recoveryEmails: [...done, entry] })

    const { subject, paragraphs } = await writeRecoveryEmail(product, cart, step)
    const brand = await emailBrandFor({ productId: product.id })
    const stopUrl = `${origin}/api/loja?action=recovery-stop&id=${encodeURIComponent(cart.id)}&k=${key}`
    const html = emailLayout(brand, {
      preheader: paragraphs[0].slice(0, 120),
      title: subject,
      body: paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155">${escapeHtml(p)}</p>`).join(''),
      button: { label: 'Finalizar minha compra', url: checkoutLink(origin, product, cart, step) },
      footer: `Você recebeu este e-mail porque começou uma compra de ${escapeHtml(product.name)}.<br><a href="${escapeHtml(stopUrl)}" style="color:#94a3b8">Não quero mais receber lembretes deste pedido</a>`,
    })
    const ok = await sendMail({ to: cart.email, subject, html, unsubscribeUrl: stopUrl })
    await updateDoc(`storeAbandoned/${cart.id}`, { recoveryEmails: [...done, { ...entry, subject, ok }] }).catch(() => {})
    if (ok) sent++
  }
  return { sent }
}

/** Link "não quero mais receber" do rodapé do e-mail. Devolve uma página simples. */
export async function stopRecovery(id, key) {
  const page = (title, text) =>
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head><body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px"><main style="max-width:420px;background:#fff;border-radius:16px;padding:32px;text-align:center"><h1 style="font-size:20px;margin:0 0 8px;color:#0f172a">${title}</h1><p style="margin:0;color:#475569;line-height:1.6">${text}</p></main></body></html>`
  if (!/^[\w-]{5,120}$/.test(id) || !key) return page('Link inválido', 'Este link não é válido.')
  const snap = await getDoc(`storeAbandoned/${id}`)
  if (!snap.exists || snap.data().recoveryKey !== key) return page('Pronto', 'Você não vai receber mais lembretes deste pedido.')
  await updateDoc(`storeAbandoned/${id}`, { recoveryStopped: true })
  return page('Pronto', 'Você não vai receber mais lembretes deste pedido.')
}
