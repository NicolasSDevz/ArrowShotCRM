/** Uma "família" de cor por cliente — deriva tanto o texto (cards do board)
 *  quanto o chip de fundo (calendário geral) da MESMA família, pro mesmo
 *  cliente ler sempre com a mesma cor em qualquer tela.
 *
 *  As classes ficam escritas por extenso (não `bg-${family}-100`) de
 *  propósito: o Tailwind só inclui no CSS final as classes que consegue ler
 *  como string literal no código-fonte — uma classe montada em runtime via
 *  interpolação nunca aparece no bundle. */
const CLIENT_TEXT_PALETTE = [
  'text-blue-600',
  'text-violet-600',
  'text-emerald-600',
  'text-amber-600',
  'text-pink-600',
  'text-cyan-600',
  'text-orange-600',
  'text-teal-600',
  'text-indigo-600',
  'text-rose-600',
]

const CLIENT_CHIP_PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-pink-100 text-pink-700',
  'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
  'bg-rose-100 text-rose-700',
]

function hashIndex(key: string, paletteLength: number): number {
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return hash % paletteLength
}

/** Deterministic text-color class for a client, so the same client always
 *  reads in the same color across the Social Media board cards without
 *  storing a color field. */
export function clientHashColor(key: string): string {
  return CLIENT_TEXT_PALETTE[hashIndex(key, CLIENT_TEXT_PALETTE.length)]
}

/** Classes de chip (fundo + texto) pra um cliente no calendário geral —
 *  mesmo índice/família de cor de clientHashColor (as duas paletas têm o
 *  mesmo tamanho e ordem), só que como pill preenchida. */
export function clientHashChip(key: string): string {
  return CLIENT_CHIP_PALETTE[hashIndex(key, CLIENT_CHIP_PALETTE.length)]
}
