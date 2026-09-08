import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useDailyRoutine } from '../../hooks/useDailyRoutine'

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Dashboard widget — checklist diário personalizado por pessoa (ver
 *  services/dailyRoutineTemplates.ts). Não renderiza nada quando o usuário
 *  logado não tem uma rotina definida (ninguém além de Bruno/Jamilson/
 *  Ciane/Nicolas tem uma hoje). */
export function DailyRoutineWidget() {
  const { profile } = useAuth()
  const { personKey, items, completedIds, toggle } = useDailyRoutine()

  if (!profile || !personKey) return null

  const weekdayLabel = capitalize(format(new Date(), 'EEEE', { locale: ptBR }))
  const firstName = profile.name.split(' ')[0]
  const total = items.length
  const done = items.filter((item) => completedIds.includes(item.id)).length
  const allDone = total > 0 && done === total
  const progressPct = total > 0 ? (done / total) * 100 : 0

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]" style={{ borderLeft: '4px solid #2563EB' }} data-dash-accent>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-[16px] font-semibold text-slate-900">Rotina de hoje — {weekdayLabel}</p>
          <p className="text-[13px] text-[#64748B]">Olá, {firstName}! Aqui está sua rotina para hoje.</p>
        </div>
        {total > 0 && <p className="shrink-0 text-[13px] text-[#64748B]">{done}/{total} concluídos</p>}
      </div>

      {total === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Sem itens de rotina para hoje.</p>
      ) : (
        <>
          <div className="mt-2.5 h-[6px] w-full overflow-hidden rounded-full" style={{ backgroundColor: '#E2E8F0' }}>
            <div
              className="h-full rounded-full transition-all duration-300 ease-in-out"
              style={{ width: `${progressPct}%`, backgroundColor: allDone ? '#10B981' : '#2563EB' }}
            />
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            {items.map((item) => {
              const checked = completedIds.includes(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item.id)}
                  className="flex items-center gap-2.5 text-left"
                >
                  <span
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-colors duration-150 ease-in-out ${
                      checked ? 'border-brand-600 bg-brand-600' : 'border-slate-300 bg-white'
                    }`}
                  >
                    {checked && <Check size={12} className="text-white" strokeWidth={3} />}
                  </span>
                  <span
                    className={`text-[14px] transition-opacity duration-150 ease-in-out ${
                      checked ? 'text-[#94A3B8] line-through opacity-50' : 'text-[#0F172A]'
                    }`}
                  >
                    {item.text}
                  </span>
                </button>
              )
            })}
          </div>

          {allDone && <p className="mt-3.5 text-[14px] font-medium text-[#10B981]">✅ Rotina do dia completa!</p>}
        </>
      )}
    </div>
  )
}
