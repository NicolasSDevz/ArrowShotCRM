import confetti from 'canvas-confetti'

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#FFFFFF', '#60A5FA']

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Canhão duplo dos cantos superiores por 4s: duas rajadas de 100 + uma
 *  trilha leve preenchendo a duração. spread 70, gravity 1.2. */
function fireConfetti() {
  const base = { spread: 70, gravity: 1.2, colors: COLORS, disableForReducedMotion: true } as const

  confetti({ ...base, particleCount: 100, angle: 60, origin: { x: 0, y: 0.6 } })
  confetti({ ...base, particleCount: 100, angle: 120, origin: { x: 1, y: 0.6 } })

  const end = Date.now() + 4000
  const tick = () => {
    confetti({ ...base, particleCount: 3, angle: 60, origin: { x: 0, y: 0.6 }, startVelocity: 45 })
    confetti({ ...base, particleCount: 3, angle: 120, origin: { x: 1, y: 0.6 }, startVelocity: 45 })
    if (Date.now() < end) requestAnimationFrame(tick)
  }
  tick()
}

/** Dó–mi–sol ascendente (C5-E5-G5), ~0.8s, onda sine, volume 30%.
 *  Gerado na hora com a Web Audio API — sem arquivo externo. */
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const notes = [523.25, 659.25, 783.99] // dó, mi, sol
    const t0 = ctx.currentTime
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = t0 + i * 0.22
      const dur = 0.3
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.linearRampToValueAtTime(0.3, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + dur)
    })
    setTimeout(() => ctx.close().catch(() => {}), 1300)
  } catch {
    /* AudioContext bloqueado (sem gesto do usuário nessa aba) — sem som */
  }
}

/** Dispara a comemoração completa: confetes + som. O toast é responsabilidade
 *  do CelebrationOverlay. Respeita prefers-reduced-motion (só o som fica). */
export function fireCelebration() {
  if (!prefersReducedMotion()) fireConfetti()
  playChime()
}
