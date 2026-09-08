import type { MetaAdsPlanning, GoogleAdsPlanning } from '../types'

/** Totais de estrutura de um planejamento — usados tanto no resumo da tela
 *  quanto nos slides da apresentação, pra nunca ficarem dessincronizados. */
export interface PlanningTotals {
  campanhas: number
  conjuntos: number
  anuncios: number
}

/** Cada campanha sem quantidade informada conta como 1 (assume-se pelo menos
 *  um conjunto/anúncio por campanha planejada). */
function sumQty(campanhas: { qtd?: number }[]): number {
  return campanhas.reduce((sum, c) => sum + (c.qtd && c.qtd > 0 ? c.qtd : 1), 0)
}

export function metaTotals(meta: MetaAdsPlanning): PlanningTotals {
  const campanhas = meta.campanhas ?? []
  return {
    campanhas: campanhas.length,
    conjuntos: sumQty(campanhas.map((c) => ({ qtd: c.qtdConjuntos }))),
    anuncios: sumQty(campanhas.map((c) => ({ qtd: c.qtdAnuncios }))),
  }
}

export function googleTotals(google: GoogleAdsPlanning): PlanningTotals {
  const campanhas = google.campanhas ?? []
  return {
    campanhas: campanhas.length,
    conjuntos: sumQty(campanhas.map((c) => ({ qtd: c.qtdGrupos }))),
    anuncios: sumQty(campanhas.map((c) => ({ qtd: c.qtdAnuncios }))),
  }
}

/** Uma cidade/palavra-chave por linha no formulário -> lista de itens limpa. */
export function linesToList(raw?: string): string[] {
  if (!raw) return []
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}
