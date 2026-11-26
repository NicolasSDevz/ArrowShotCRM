// Imposto que as plataformas cobram em cima do anúncio no Brasil.
//
// Meta: desde jan/2026 repassa PIS/COFINS (9,25%) + ISS (2,9%) = 12,15% do
// valor pago. No Pix/boleto (pré-pago) de R$ 100 pagos só R$ 87,85 viram
// anúncio; no cartão (pós-pago) R$ 100 de anúncio viram R$ 113,83 na fatura.
// Nos dois casos o custo real = gasto do Gerenciador ÷ (1 − 12,15%).
//
// Google: em 2026 não repassa imposto (absorve). Há notícia de repasse a
// partir de jan/2027 — quando confirmar na fatura, é só mudar GOOGLE_TAX_RATE.
//
// Regra da agência: relatório e análise mostram o valor COM imposto (o que
// sai do bolso do cliente). Só a previsão de saldo usa o valor sem imposto,
// porque o saldo que a Meta mostra já é líquido.

export const META_TAX_RATE = 0.1215
export const GOOGLE_TAX_RATE = 0

/** Valor da plataforma (sem imposto) -> valor pago pelo cliente (com imposto). */
export function grossUp(value, rate) {
  const n = Number(value)
  if (!Number.isFinite(n) || !rate) return value
  return n / (1 - rate)
}

export const withMetaTax = (v) => grossUp(v, META_TAX_RATE)
export const withGoogleTax = (v) => grossUp(v, GOOGLE_TAX_RATE)

// Campos de valor em R$ que a Graph API devolve numa linha de insights.
const META_MONEY_FIELDS = ['spend', 'cpc', 'cpm', 'cpp', 'cost_per_unique_click']

/** Linha crua de /insights da Graph API (strings) -> mesmos campos já com imposto. */
export function applyMetaTaxToRow(row) {
  if (!row || typeof row !== 'object') return row
  const out = { ...row }
  for (const f of META_MONEY_FIELDS) {
    if (out[f] != null && out[f] !== '') out[f] = String(withMetaTax(out[f]))
  }
  if (Array.isArray(out.cost_per_action_type)) {
    out.cost_per_action_type = out.cost_per_action_type.map((a) =>
      a && a.value != null ? { ...a, value: String(withMetaTax(a.value)) } : a
    )
  }
  return out
}
