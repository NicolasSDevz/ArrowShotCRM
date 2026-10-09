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
}: {
  tabs: { label: string; content: ReactNode; secondary?: boolean; icon?: ReactNode }[]
  /** Nome da lista de abas lido pelo leitor de tela. */
  label?: string
}) {
  const [active, setActive] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const baseId = useId()
  const tabRefs = useRef<Record<number, HTMLButtonElement | null>>({})

  const indexed = tabs.map((t, i) => ({ ...t, i }))
  const primary = indexed.filter((t) => !t.secondary)
  const secondary = indexed.filter((t) => t.secondary)
  // Com as extras fechadas, a aba extra que estiver aberta continua aparecendo.
  const visibleSecondary = showAll ? secondary : secondary.filter((t) => t.i === active)
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
      key={t.label}
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
      className={`shrink-0 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
        active === t.i
          ? 'border-brand-600 text-brand-700'
          : 'border-transparent text-slate-400 hover:text-slate-600'
      }`}
    >
      {t.icon ? (
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="opacity-80">{t.icon}</span>
          {t.label}
        </span>
      ) : (
        t.label
      )}
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
      <div className="flex flex-wrap items-center gap-x-10 gap-y-1 border-b border-slate-100 px-6">
        <div
          role="tablist"
          aria-label={label}
          className={`flex flex-1 flex-wrap items-center gap-x-10 gap-y-1 ${showAll ? '' : 'justify-between'}`}
        >
          {visible.map(tabButton)}
        </div>
        {secondary.length > 0 && (
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
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          >
            {showAll ? (
              <>
                Menos <ChevronUp size={13} aria-hidden="true" />
              </>
            ) : (
              <>
                Mais ({hiddenSecondary.length}) <ChevronDown size={13} aria-hidden="true" />
              </>
            )}
          </button>
        )}
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(active)} className="px-5 py-4">
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
