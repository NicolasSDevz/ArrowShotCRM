import { useState } from 'react'
import { CalendarPage } from './CalendarPage'
import { MeetingsPage } from './MeetingsPage'

type CalendarTab = 'calendario' | 'reunioes'

const TAB_LABEL: Record<CalendarTab, string> = {
  calendario: 'Calendário',
  reunioes: 'Reuniões',
}

/** Une Calendário e Reuniões numa página só, com abas internas — mesmo
 *  padrão do "Métricas" (ver MetricsPage.tsx). Cada aba continua sendo o
 *  mesmo componente/lógica de antes, só sem o próprio <h1>. Rota antiga
 *  /reunioes substituída por /calendario (aba "Reuniões" por padrão quando
 *  vem de um link direto — ver App.tsx). */
export function CalendarMeetingsPage({ initialTab = 'calendario' }: { initialTab?: CalendarTab }) {
  const [tab, setTab] = useState<CalendarTab>(initialTab)

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900">Calendário</h1>
          <p className="text-[15px] text-[#64748B]">Publicações, prazos e reuniões</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {(['calendario', 'reunioes'] as CalendarTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ease-in-out ${
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">{tab === 'calendario' ? <CalendarPage /> : <MeetingsPage />}</div>
    </div>
  )
}
