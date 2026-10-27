import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronRight } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { usePrivacy } from '../../context/PrivacyContext'
import { REPORT_TYPE_LABEL, type Client, type Report } from '../../types'

/** Card de um cliente na visão "Por cliente" de Relatórios: quantos relatórios
 *  de cada tipo ele tem e qual foi o último, sem precisar abrir nada.
 *  Clicar abre o histórico completo (ClientReportsDrawer). */
export function ReportsClientCard({ client, reports, onClick }: { client: Client; reports: Report[]; onClick: () => void }) {
  const { isPrivacyMode } = usePrivacy()
  const monthly = reports.filter((r) => r.type === 'monthly').length
  const weekly = reports.filter((r) => r.type === 'weekly').length
  const latest = [...reports].sort((a, b) => b.periodEnd.toMillis() - a.periodEnd.toMillis())[0]
  const name = isPrivacyMode ? '••••••' : client.companyName
  const latestText = latest
    ? latest.type === 'monthly'
      ? format(latest.periodStart.toDate(), "MMMM 'de' yyyy", { locale: ptBR })
      : `${format(latest.periodStart.toDate(), 'dd/MM', { locale: ptBR })} a ${format(latest.periodEnd.toDate(), 'dd/MM', { locale: ptBR })}`
    : ''

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${name}: ${monthly} mensais, ${weekly} semanais${latest ? `. Último ${REPORT_TYPE_LABEL[latest.type].toLowerCase()}, ${latestText}` : ''}. Abrir histórico`}
      className="group flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors duration-150 ease-in-out hover:border-brand-300"
    >
      <div className="flex w-full items-center gap-3">
        <Avatar name={isPrivacyMode ? 'Cliente' : client.companyName} photoURL={isPrivacyMode ? null : client.logoUrl} size="sm" />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{name}</p>
        <ChevronRight size={16} className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </div>
      <div className="flex flex-wrap gap-1.5" aria-hidden="true">
        {monthly > 0 && (
          <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
            {monthly} mensa{monthly === 1 ? 'l' : 'is'}
          </span>
        )}
        {weekly > 0 && (
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
            {weekly} semana{weekly === 1 ? 'l' : 'is'}
          </span>
        )}
      </div>
      {latest && (
        <p className="w-full border-t border-slate-100 pt-2.5 text-xs text-slate-500" aria-hidden="true">
          <span className="text-slate-400">Último: </span>
          <span className="font-medium capitalize text-slate-700">{latestText}</span>
          {latest.generatedByName && <span className="text-slate-400"> · por {latest.generatedByName.split(' ')[0]}</span>}
        </p>
      )}
    </button>
  )
}
