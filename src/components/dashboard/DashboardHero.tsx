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
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0" />
          <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {/* alvo */}
      <g className="hero-target" transform="translate(232 80)">
        <circle r="58" fill="none" stroke="#1e3a8a" strokeOpacity="0.55" strokeWidth="1.5" />
        <circle r="44" fill="none" stroke="#2563eb" strokeOpacity="0.45" strokeWidth="1.5" />
        <circle r="30" fill="none" stroke="#3b82f6" strokeOpacity="0.6" strokeWidth="1.5" />
        <circle r="16" fill="#2563eb" fillOpacity="0.25" stroke="#60a5fa" strokeWidth="1.5" />
        <circle r="5" fill="#93c5fd" />
        <circle className="hero-ping" r="16" fill="none" stroke="#93c5fd" strokeWidth="1.5" />
      </g>
      {/* rastros */}
      <g className="hero-trails" stroke="url(#hero-trail)" strokeLinecap="round">
        <line x1="40" y1="64" x2="150" y2="74" strokeWidth="1.5" />
        <line x1="20" y1="80" x2="160" y2="80" strokeWidth="2" />
        <line x1="56" y1="96" x2="150" y2="86" strokeWidth="1.5" />
      </g>
      {/* flecha */}
      <g className="hero-arrow">
        <line x1="120" y1="80" x2="228" y2="80" stroke="#e2e8f0" strokeWidth="3" strokeLinecap="round" />
        <path d="M222 72 L236 80 L222 88 Z" fill="#e2e8f0" />
        <path d="M120 80 L106 70 L114 80 L106 90 Z" fill="#60a5fa" />
        <path d="M132 80 L118 70 L126 80 L118 90 Z" fill="#3b82f6" />
      </g>
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
      className="relative overflow-hidden rounded-2xl border px-6 py-6 sm:px-8"
      style={{
        background:
          'radial-gradient(circle at 82% 50%, rgb(59 130 246 / 0.28), transparent 38%), linear-gradient(120deg, #0b1220 0%, #0d1730 55%, #10204a 100%)',
        borderColor: '#1c2a4a',
      }}
    >
      <div className="pointer-events-none absolute inset-y-2 right-4 hidden w-[50%] max-w-[380px] sm:block">
        <ArrowTarget />
      </div>
      <div className="relative max-w-[60%] max-sm:max-w-full">
        <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: '#7aa2f7' }}>
          {dateLabel}
        </p>
        <h1 id="dashboard-title" className="mt-1.5 text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]" style={{ color: '#f1f5f9' }}>
          <span className="sr-only">Dashboard. </span>
          {greeting(now.getHours())}
          {first ? `, ${first}` : ''}
        </h1>
        <p className="mt-1 text-sm" style={{ color: '#94a3b8' }}>
          Receita, carteira e crescimento da Arrow Shot. Mira no alvo.
        </p>
      </div>
    </section>
  )
}
