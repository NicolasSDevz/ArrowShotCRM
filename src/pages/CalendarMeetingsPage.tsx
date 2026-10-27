import { useNavigate } from 'react-router-dom'
import { CalendarPage } from './CalendarPage'
import { MeetingsPage } from './MeetingsPage'

type CalendarTab = 'reunioes' | 'calendario'

const TAB_LABEL: Record<CalendarTab, string> = {
  reunioes: 'Reuniões',
  calendario: 'Calendário',
}

const TAB_PATH: Record<CalendarTab, string> = {
  reunioes: '/reunioes',
  calendario: '/calendario',
}

/** Une Reuniões e Calendário numa página só, com abas internas — mesmo
 *  padrão do "Métricas" (ver MetricsPage.tsx). Reuniões é a aba principal
 *  (item "Reuniões" do menu lateral); cada aba tem a própria rota
 *  (/reunioes e /calendario, ver App.tsx), então links diretos pro
 *  calendário continuam funcionando. */
export function CalendarMeetingsPage({ initialTab = 'reunioes' }: { initialTab?: CalendarTab }) {
  const navigate = useNavigate()
  const tab = initialTab

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900">Reuniões</h1>
          <p className="mt-0.5 text-sm text-slate-500">Reuniões, publicações e prazos</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {(['reunioes', 'calendario'] as CalendarTab[]).map((t) => (
          <button
            key={t}
            onClick={() => navigate(TAB_PATH[t], { replace: true })}
            aria-current={tab === t ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t ? 'border-brand-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="flex-1">{tab === 'calendario' ? <CalendarPage /> : <MeetingsPage />}</div>
    </div>
  )
}
