// Gera src/dark-families.css: overrides do tema escuro para TODAS as famílias
// de cor do Tailwind usadas no app (bg/text/border/ring/divide/gradiente).
// Uso: node scripts/gen-dark-families.mjs
//
// Ideia: no escuro, fundos "-50/-100/-200" viram uma película translúcida da
// cor sobre a superfície escura, textos "-400..-900" viram tons pastel
// legíveis e fundos sólidos "-300..-800" ficam mais suaves — em vez de manter
// as cores saturadas pensadas para fundo branco.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// [hue, luminosidade do texto pastel, semântica?]. Semântica (erro/aviso/
// sucesso/info) tem a tinta de fundo um pouco mais forte que as decorativas.
const FAMILIES = {
  red: [0, 70, true],
  orange: [25, 66, false],
  amber: [38, 64, true],
  yellow: [48, 64, false],
  lime: [84, 62, false],
  green: [142, 62, true],
  emerald: [160, 62, true],
  teal: [173, 62, false],
  cyan: [188, 64, false],
  sky: [199, 68, false],
  blue: [217, 72, true],
  indigo: [239, 76, false],
  violet: [258, 76, false],
  purple: [274, 74, false],
  fuchsia: [292, 72, false],
  pink: [330, 72, false],
  rose: [350, 72, false],
  brand: [217, 72, true],
}

// Paleta oficial (Dark Premium): cores exatas de texto e de fundo sólido para
// as famílias que carregam a identidade ou um significado.
const BLUE = { text: '#7FAEFF', textHover: '#A9C8FF', solid: '#4F8CFF', solidHover: '#3D7BF0' }
const OVERRIDES = {
  brand: BLUE,
  blue: BLUE,
  sky: { text: '#5CC8FF' },
  cyan: { text: '#22D3EE', textHover: '#67E8F9' },
  teal: { text: '#2DD4BF', textHover: '#5EEAD4', solid: '#14A08C', solidHover: '#11907E' },
  emerald: { text: '#2DD4BF', textHover: '#5EEAD4', solid: '#14A08C', solidHover: '#11907E' },
  green: { text: '#4ADE9B', textHover: '#86EFAC' },
  red: { text: '#F87171', textHover: '#FCA5A5', solid: '#DC4E4E', solidHover: '#C84343' },
  amber: { text: '#F5B84B', textHover: '#F8CB78', solid: '#C98A1E', solidHover: '#B57C1A' },
  violet: { text: '#A78BFA', textHover: '#C4B5FD' },
  purple: { text: '#B794F6', textHover: '#D0B8FA' },
  indigo: { text: '#8EA2FF', textHover: '#B4C1FF' },
}

const ROOT = ':root[data-theme="dark"]'
const r2 = (n) => Math.round(n * 100) / 100

const out = []
const push = (selectors, decl) => {
  if (selectors.length) out.push(`${ROOT} :is(${selectors.join(',')}) { ${decl} }`)
}
// .bg-red-50  |  .hover\:bg-red-50:hover
const base = (prefix, fam, shades) => shades.map((s) => `.${prefix}-${fam}-${s}`)
const hover = (prefix, fam, shades) => shades.map((s) => `.hover\\:${prefix}-${fam}-${s}:hover`)
const withOpacity = (prefix, fam, shades) => shades.map((s) => `[class*="${prefix}-${fam}-${s}/"]`)

out.push('/* GERADO por scripts/gen-dark-families.mjs — não editar à mão. */')

for (const [fam, [h, textL, semantic]] of Object.entries(FAMILIES)) {
  const a = semantic ? [0.1, 0.16, 0.22] : [0.07, 0.11, 0.16]
  const tint = (alpha) => `hsl(${h} 70% 55% / ${r2(alpha)})`
  out.push(`\n/* ${fam} */`)

  // fundos translúcidos (tintas) — "-50/-100/-200"
  ;[
    [50, a[0]],
    [100, a[1]],
    [200, a[2]],
  ].forEach(([shade, alpha]) => {
    push([...base('bg', fam, [shade]), ...withOpacity('bg', fam, [shade])], `background-color: ${tint(alpha)};`)
    push(hover('bg', fam, [shade]), `background-color: ${tint(alpha + 0.05)};`)
  })
  // fundos sólidos suaves — "-300..-800"
  const solidL = Math.max(textL - 24, 38)
  const o = OVERRIDES[fam] ?? {}
  const solid = (shade) =>
    o.solid ? (shade >= 800 ? o.solidHover : o.solid) : `hsl(${h} 50% ${shade >= 600 ? solidL - 4 : solidL}%)`
  for (const shade of [300, 400, 500, 600, 700, 800]) {
    push(base('bg', fam, [shade]), `background-color: ${solid(shade)};`)
  }
  for (const shade of [500, 600, 700]) {
    push(hover('bg', fam, [shade]), `background-color: ${o.solidHover ?? solid(shade + 100)};`)
  }
  // textos pastel legíveis
  push(base('text', fam, [400, 500, 600, 700, 800, 900]), `color: ${o.text ?? `hsl(${h} 60% ${textL}%)`};`)
  push(hover('text', fam, [400, 500, 600, 700, 800]), `color: ${o.textHover ?? `hsl(${h} 65% ${Math.min(textL + 6, 88)}%)`};`)
  // bordas / anéis / divisores
  push(base('border', fam, [100, 200, 300]), `border-color: hsl(${h} 28% 24%);`)
  push(base('border', fam, [400, 500, 600]), `border-color: hsl(${h} 38% 38%);`)
  push(hover('border', fam, [200, 300, 400]), `border-color: hsl(${h} 38% 40%);`)
  push(base('ring', fam, [100, 200, 300, 400, 500]), `--tw-ring-color: hsl(${h} 32% 30%);`)
  push([100, 200, 300].map((s) => `.divide-${fam}-${s} > :not(:last-child)`), `border-color: hsl(${h} 28% 22%);`)
  // gradientes
  push(
    [50, 100, 200].flatMap((s) => [`.from-${fam}-${s}`, `.to-${fam}-${s}`, `.via-${fam}-${s}`]),
    `--tw-gradient-from: ${tint(a[1])}; --tw-gradient-to: ${tint(a[0])}; --tw-gradient-via: ${tint(a[0])};`,
  )
}

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/dark-families.css')
writeFileSync(file, out.join('\n') + '\n')
console.log('escrito', file, `(${out.length} linhas)`)
