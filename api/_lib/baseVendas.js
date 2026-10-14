// Base de Vendas — fonte ÚNICA do conhecimento comercial da Arrow Shot
// (planos/preços, ICP, objeções, scripts, metas...), editável em
// Configurações → Base de Vendas (ver src/pages/BaseVendasPage.tsx) e
// gravada em config/baseVendas. Usada tanto pelo Archer (api/ai/index.js,
// seção "Vendas da Arrow Shot" do prompt) quanto pelo Copiloto de Vendas
// (sugestões ao vivo) — nenhum dos dois guarda cópia própria.
//
// Antes dessa tela existir, esse conteúdo vivia hardcoded no prompt do
// Archer. Se ninguém nunca abriu a tela ainda, config/baseVendas não existe
// — `getBaseVendas` devolve null e quem chama decide o fallback (nunca
// duplicamos aqui o texto padrão, que mora só em
// src/config/baseVendasDefault.ts e é gravado no Firestore na primeira
// visita à tela).

import { getDoc } from './firebaseAdmin.js'

const CACHE_TTL_MS = 60_000
let cached = null // { value, exp }

export async function getBaseVendas() {
  const now = Date.now()
  if (cached && cached.exp > now) return cached.value

  const snap = await getDoc('config/baseVendas')
  const value = snap.exists ? snap.data() : null
  cached = { value, exp: now + CACHE_TTL_MS }
  return value
}

function objecoesBlock(objecoes) {
  if (!Array.isArray(objecoes) || objecoes.length === 0) return '(nenhuma objeção cadastrada ainda)'
  return objecoes.map((o, i) => `${i + 1}. "${o.objecao}": ${o.resposta}`).join('\n')
}

/** Monta o bloco de texto da Base de Vendas pro prompt — mesma formatação
 *  pro Archer e pro Copiloto, só o texto em volta (quem é, o que fazer com
 *  isso) muda por chamador. */
export function formatBaseVendasForPrompt(baseVendas) {
  if (!baseVendas) {
    return '(Base de Vendas ainda não configurada em Configurações → Base de Vendas — avise que alguém com acesso precisa preencher.)'
  }
  const b = baseVendas
  return [
    `**O que vendemos:** ${b.oQueVendemos || '—'}`,
    `**Metas do período:** ${b.metas || '—'}`,
    `**ICP:** ${b.icpAntiIcp || '—'}`,
    `**Qualificação obrigatória antes de agendar:** ${b.qualificacao || '—'}`,
    `**Sinais de compra:** ${b.sinaisCompra || '—'}`,
    `**BANT no CRM:** ${b.bant || '—'}`,
    `**SDR no WhatsApp:** ${b.sdrWhatsapp || '—'}`,
    `**No-show e follow-up:** ${b.noShowFollowUp || '—'}`,
    `**As objeções e a resposta:**\n${objecoesBlock(b.objecoes)}`,
    `**Prova social:** ${b.provaSocial || '—'}`,
    `**Pagamento (cobrança pós-fechamento):** ${b.pagamento || '—'}`,
    `**Retenção:** ${b.retencao || '—'}`,
    `**Erros que já custaram vendas:** ${b.errosComuns || '—'}`,
    `**O que nunca prometer:** ${b.oQueNuncaPrometer || '—'}`,
  ].join('\n\n')
}
