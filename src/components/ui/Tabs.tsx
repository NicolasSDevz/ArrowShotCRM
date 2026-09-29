import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

/** Abas com `secondary: true` ficam escondidas atrás do botão "Mais" até a pessoa abrir. */
export function Tabs({ tabs }: { tabs: { label: string; content: ReactNode; secondary?: boolean }[] }) {
  const [active, setActive] = useState(0)
  const [showAll, setShowAll] = useState(false)

  const indexed = tabs.map((t, i) => ({ ...t, i }))
  const primary = indexed.filter((t) => !t.secondary)
  const secondary = indexed.filter((t) => t.secondary)
  // Com as extras fechadas, a aba extra que estiver aberta continua aparecendo.
  const visibleSecondary = showAll ? secondary : secondary.filter((t) => t.i === active)

  const tabButton = (t: (typeof indexed)[number]) => (
    <button
      key={t.label}
      onClick={() => setActive(t.i)}
      className={`shrink-0 whitespace-nowrap border-b-2 px-2 py-2.5 text-sm font-medium transition-colors ${
        active === t.i
          ? 'border-brand-600 text-brand-700'
          : 'border-transparent text-slate-400 hover:text-slate-600'
      }`}
    >
      {t.label}
    </button>
  )

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 px-5">
        {primary.map(tabButton)}
        {visibleSecondary.map(tabButton)}
        {secondary.length > 0 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="ml-1 flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          >
            {showAll ? (
              <>
                Menos <ChevronUp size={13} />
              </>
            ) : (
              <>
                Mais ({secondary.length - visibleSecondary.length}) <ChevronDown size={13} />
              </>
            )}
          </button>
        )}
      </div>
      <div className="px-5 py-4">{tabs[active].content}</div>
    </div>
  )
}
