/** Imposto da Meta que já vem somado ao gasto (12,15% do valor pago).
 *  Mesmo número de api/_lib/adTax.js — se mudar lá, muda aqui. */
export const META_TAX_RATE = 0.1215

/** Quanto do valor (já com imposto) foi imposto. */
export function taxPart(grossValue: number | undefined, rate: number | undefined): number | undefined {
  if (grossValue == null || !rate || Number.isNaN(grossValue)) return undefined
  return grossValue * rate
}
