import { useMemo } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '../../context/AuthContext'

function greeting(h: number) {
  if (h < 5) return 'Boa noite'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Desenho do topo: flecha cravada no centro do alvo, com rastro. Só SVG e
 *  uma animação curta de entrada em CSS (desligada para quem pede menos movimento). */
function ArrowTarget() {
  return (
    <svg viewBox="0 0 320 160" preserveAspectRatio="xMaxYMid meet" className="hero-art h-full w-full" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="hero-trail" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0" />
          <stop offset="100%" stopColor="#A5F3FC" stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id="hero-core" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#168BFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* alvo */}
      <g className="hero-target" transform="translate(232 80)">
        <circle r="74" fill="url(#hero-core)" opacity="0.5" />
        <circle r="62" fill="none" stroke="#22D3EE" strokeOpacity="0.18" strokeWidth="1.2" />
        <circle r="48" fill="none" stroke="#22D3EE" strokeOpacity="0.32" strokeWidth="1.4" />
        <circle r="33" fill="none" stroke="#38BDF8" strokeOpacity="0.6" strokeWidth="1.6" />
        <circle r="18" fill="#168BFF" fillOpacity="0.3" stroke="#67E8F9" strokeWidth="1.8" />
        <circle r="6" fill="#E0F7FF" />
        <circle className="hero-ping" r="18" fill="none" stroke="#67E8F9" strokeWidth="1.5" />
      </g>
      {/* rastros */}
      <g className="hero-trails" stroke="url(#hero-trail)" strokeLinecap="round">
        <line x1="40" y1="66" x2="150" y2="75" strokeWidth="1.4" />
        <line x1="14" y1="80" x2="160" y2="80" strokeWidth="2" />
        <line x1="56" y1="94" x2="150" y2="85" strokeWidth="1.4" />
      </g>
      {/* flecha */}
      <g className="hero-arrow">
        <line x1="120" y1="80" x2="228" y2="80" stroke="#F1F5F9" strokeWidth="3" strokeLinecap="round" />
        <path d="M222 72 L236 80 L222 88 Z" fill="#F1F5F9" />
        <path d="M120 80 L106 70 L114 80 L106 90 Z" fill="#22D3EE" />
        <path d="M132 80 L118 70 L126 80 L118 90 Z" fill="#4F8CFF" />
      </g>
    </svg>
  )
}

/** Ondas sutis do fundo do topo (linhas de "performance"). */
function HeroWaves() {
  return (
    <svg viewBox="0 0 800 200" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
      <path d="M420 200 C 520 150, 560 60, 800 20 L 800 200 Z" fill="#168BFF" fillOpacity="0.16" />
      <path d="M520 200 C 600 160, 640 90, 800 70 L 800 200 Z" fill="#22D3EE" fillOpacity="0.08" />
      <path d="M380 200 C 500 140, 560 40, 800 0" fill="none" stroke="#4F8CFF" strokeOpacity="0.35" strokeWidth="1.2" />
      <path d="M460 200 C 560 150, 610 70, 800 40" fill="none" stroke="#22D3EE" strokeOpacity="0.22" strokeWidth="1" />
    </svg>
  )
}

/** Topo do Dashboard: saudação, data e o desenho da flecha no alvo. */
export function DashboardHero() {
  const { profile } = useAuth()
  const now = new Date()
  const first = (profile?.name ?? '').trim().split(/\s+/)[0]
  const dateLabel = useMemo(() => {
    const s = format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }, [])

  return (
    <section
      aria-labelledby="dashboard-title"
      className="relative overflow-hidden rounded-2xl border px-6 py-7 sm:px-10 sm:py-9"
      style={{
        background:
          'var(--hero-bg, radial-gradient(circle at 84% 50%, rgb(34 211 238 / 0.22), transparent 30%), linear-gradient(110deg, #0A1428 0%, #0C1D44 45%, #0F3A8C 80%, #1565D8 100%))',
        borderColor: 'rgb(79 140 255 / 0.45)',
        boxShadow: '0 20px 50px -24px rgb(22 139 255 / 0.55), inset 0 1px 0 rgb(255 255 255 / 0.06)',
      }}
    >
      <HeroWaves />
      <div className="pointer-events-none absolute inset-y-2 right-4 hidden w-[50%] max-w-[460px] sm:block">
        <ArrowTarget />
      </div>
      <div className="relative max-w-[60%] max-sm:max-w-full">
        <p className="text-[13px] font-bold uppercase tracking-[0.08em] sm:text-[15px]" style={{ color: '#4F8CFF' }}>
          {dateLabel}
        </p>
        <h1 id="dashboard-title" className="mt-2 text-[30px] font-bold leading-tight tracking-tight sm:text-[42px]" style={{ color: '#FFFFFF' }}>
          <span className="sr-only">Dashboard. </span>
          {greeting(now.getHours())}
          {first ? `, ${first}` : ''}
        </h1>
        <p className="mt-2 text-[15px] sm:text-[18px]" style={{ color: '#C3CEDD' }}>
          Receita, carteira e crescimento da Arrow Shot. Mira no alvo.
        </p>
      </div>
    </section>
  )
}
