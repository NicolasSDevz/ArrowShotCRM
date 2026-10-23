import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

/** Abas com `secondary: true` ficam escondidas atrás do botão "Mais" até a pessoa abrir.
 *
 *  Acessível para leitor de tela (Jamilson): lista de abas com role="tablist",
 *  setas esquerda/direita, Home e End trocam de aba, a troca é anunciada em voz
 *  e o conteúdo de cada aba tem, no começo e no fim, o botão "Sair de <aba>"
 *  que devolve o foco para a lista de abas. */
export function Tabs({
  tabs,
  label = 'Abas',
  active: activeProp,
  onChange,
  variant = 'underline',
  moreLabel = 'Mais',
}: {
  tabs: {
    label: string
    content: ReactNode
    secondary?: boolean
    icon?: ReactNode
    /** Contador na bolinha ao lado do nome (0 ou vazio = sem bolinha). */
    badge?: number
    /** Texto do contador para o leitor de tela (ex.: "2 Pix para confirmar"). */
    badgeLabel?: string
    /** Bolinha de alerta (âmbar) em vez de neutra. */
    badgeAlert?: boolean
  }[]
  /** Nome da lista de abas lido pelo leitor de tela. */
  label?: string
  /** Aba aberta controlada de fora (ex.: lembrada na URL). */
  active?: number
  onChange?: (i: number) => void
  /** underline = sublinhado (padrão); pills = aba aberta em botão azul cheio;
   *  page = barra de abas solta na página (sem caixa em volta), aba aberta sublinhada. */
  variant?: 'underline' | 'pills' | 'page'
  /** Nome do botão que mostra as abas extras (secondary). */
  moreLabel?: string
}) {
  const pills = variant === 'pills'
  const page = variant === 'page'
  const [activeState, setActiveState] = useState(0)
  const active = activeProp ?? activeState
  const setActive = (i: number) => {
    setActiveState(i)
    onChange?.(i)
  }
  const [showAll, setShowAll] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const baseId = useId()
  const tabRefs = useRef<Record<number, HTMLButtonElement | null>>({})

  const indexed = tabs.map((t, i) => ({ ...t, i }))
  const primary = indexed.filter((t) => !t.secondary)
  const secondary = indexed.filter((t) => t.secondary)
  // Com as extras fechadas, a aba extra que estiver aberta continua aparecendo.
  // page: todas aparecem (as extras depois de um divisor).
  const visibleSecondary = showAll || page ? secondary : secondary.filter((t) => t.i === active)
  const visible = [...primary, ...visibleSecondary]
  const hiddenSecondary = secondary.filter((t) => !visibleSecondary.includes(t))

  const tabId = (i: number) => `${baseId}-tab-${i}`
  const panelId = `${baseId}-panel`

  const select = (i: number, focus = false) => {
    setActive(i)
    setAnnouncement(`Aba ${tabs[i].label} aberta`)
    if (focus) requestAnimationFrame(() => tabRefs.current[i]?.focus())
  }

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const pos = visible.findIndex((t) => t.i === i)
    let next: number | null = null
    if (e.key === 'ArrowRight') next = visible[(pos + 1) % visible.length].i
    else if (e.key === 'ArrowLeft') next = visible[(pos - 1 + visible.length) % visible.length].i
    else if (e.key === 'Home') next = visible[0].i
    else if (e.key === 'End') next = visible[visible.length - 1].i
    if (next === null) return
    e.preventDefault()
    select(next, true)
  }

  const backToTabs = () => {
    setAnnouncement(`Saiu de ${tabs[active].label}. Você está na lista de abas.`)
    tabRefs.current[active]?.focus()
  }

  const tabButton = (t: (typeof indexed)[number]) => (
    <button
      key={t.i}
      ref={(el) => {
        tabRefs.current[t.i] = el
      }}
      id={tabId(t.i)}
      type="button"
      role="tab"
      aria-selected={active === t.i}
      aria-controls={panelId}
      tabIndex={active === t.i ? 0 : -1}
      onClick={() => select(t.i)}
      onKeyDown={(e) => onTabKeyDown(e, t.i)}
      className={
        page
          ? `-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-brand-400 ${
              active === t.i ? 'border-brand-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`
          : pills
          ? `shrink-0 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 ${
              active === t.i ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`
          : `shrink-0 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
              active === t.i ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`
      }
    >
      <span className="flex items-center gap-1.5">
        {t.icon && <span aria-hidden="true" className={page ? (active === t.i ? 'text-brand-500' : 'opacity-70') : pills && active === t.i ? '' : 'opacity-80'}>{t.icon}</span>}
        {t.label}
        {!!t.badge && (
          <span
            className={`rounded-full px-1.5 text-[11px] font-bold leading-[18px] ${
              t.badgeAlert ? 'bg-amber-500 text-white' : pills && active === t.i ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
            }`}
            aria-label={t.badgeLabel ?? String(t.badge)}
          >
            {t.badge}
          </span>
        )}
      </span>
    </button>
  )

  const exitButton = (where: 'inicio' | 'fim') => (
    <button
      type="button"
      onClick={backToTabs}
      className="sr-only rounded-md bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 focus:not-sr-only focus:mb-3 focus:inline-block focus:outline-none focus:ring-2 focus:ring-brand-400"
    >
      {where === 'inicio' ? `Sair de ${tabs[active].label} e voltar para as abas` : `Fim de ${tabs[active].label}. Voltar para as abas`}
    </button>
  )

  return (
    <div>
      <div className={page ? 'flex items-center gap-2 border-b border-slate-200' : pills ? 'flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2.5 sm:px-4' : 'flex flex-wrap items-center gap-x-10 gap-y-1 border-b border-slate-100 px-6'}>
        <div
          role="tablist"
          aria-label={label}
          className={page ? 'flex min-w-0 flex-1 flex-wrap items-center gap-x-1' : pills ? 'flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:thin]' : `flex flex-1 flex-wrap items-center gap-x-10 gap-y-1 ${showAll ? '' : 'justify-between'}`}
        >
          {visible.map((t, n) =>
            page && t.secondary && n > 0 && !visible[n - 1].secondary ? (
              <span key={`div-${t.i}`} className="contents">
                <span aria-hidden="true" className="mx-2 h-5 w-px bg-slate-200" />
                {tabButton(t)}
              </span>
            ) : (
              tabButton(t)
            )
          )}
        </div>
        {secondary.length > 0 && !page && (
          <button
            type="button"
            onClick={() => {
              setShowAll((v) => !v)
              setAnnouncement(showAll ? 'Abas extras escondidas' : `Abas extras mostradas: ${hiddenSecondary.map((t) => t.label).join(', ')}`)
            }}
            aria-expanded={showAll}
            aria-label={
              showAll
                ? 'Mostrar menos abas'
                : `Mostrar mais abas: ${hiddenSecondary.map((t) => t.label).join(', ')}`
            }
            className={page ? 'flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800' : pills ? 'flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800' : 'flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600'}
          >
            {showAll ? (
              <>
                Menos <ChevronUp size={13} aria-hidden="true" />
              </>
            ) : (
              <>
                {moreLabel} ({hiddenSecondary.length}) <ChevronDown size={13} aria-hidden="true" />
              </>
            )}
          </button>
        )}
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(active)} className={page ? 'pt-6' : pills ? 'p-5' : 'px-5 py-4'}>
        {exitButton('inicio')}
        {tabs[active].content}
        {exitButton('fim')}
      </div>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}
