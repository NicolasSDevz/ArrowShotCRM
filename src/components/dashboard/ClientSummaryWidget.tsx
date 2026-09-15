import { format, isPast, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AlertTriangle } from 'lucide-react'
import { EmptyState } from '../ui/EmptyState'
import { Avatar } from '../ui/Avatar'
import type { ClientHealth, ClientSummaryRow } from './dashboardWidgetTypes'

const HEALTH_DOT: Record<ClientHealth, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  red: 'bg-red-500',
}

const HEALTH_LABEL: Record<ClientHealth, string> = {
  green: 'Tudo em dia',
  yellow: 'Atenção',
  red: 'Crítico',
}

function ServicePill({ service }: { service: string }) {
  if (service === 'Tráfego') return <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">Tráfego</span>
  if (service === 'Social Mídia')
    return <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">Social Mídia</span>
  if (service === 'Ambos')
    return (
      <span className="rounded-full bg-gradient-to-r from-blue-100 to-violet-100 px-2.5 py-1 text-xs font-medium text-blue-700">Ambos</span>
    )
  return <span className="text-xs text-slate-400">—</span>
}

export function ClientSummaryWidget({
  rows,
  canSeeAllTasks,
  onNavigateClient,
}: {
  rows: ClientSummaryRow[]
  canSeeAllTasks: boolean
  onNavigateClient: (clientId: string) => void
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <p className="mb-3 text-[16px] font-semibold text-slate-900">Resumo por cliente</p>
      {rows.length === 0 ? (
        <EmptyState title="Nenhum cliente ativo" />
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-left text-[15px]">
            <thead className="sticky top-0 bg-white text-[13px] font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="w-6 py-1.5"></th>
                <th className="py-1.5 pr-2 font-semibold">Cliente</th>
                <th className="py-1.5 pr-2 font-semibold">Serviço</th>
                <th className="py-1.5 pr-2 font-semibold">Responsável</th>
                <th className="py-1.5 pr-2 font-semibold">Próxima tarefa</th>
                <th className="py-1.5 font-semibold">Prazo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ client, health, service, ownerName, nextTask }, index) => {
                const overdueTask = nextTask?.dueDate && isPast(nextTask.dueDate.toDate()) && !isToday(nextTask.dueDate.toDate())
                return (
                  <tr
                    key={client.id}
                    onClick={() => onNavigateClient(client.id)}
                    className={`h-12 cursor-pointer border-t border-slate-50 text-slate-700 transition-colors duration-150 ease-in-out hover:bg-blue-50 ${
                      index % 2 === 1 ? 'bg-slate-50' : 'bg-white'
                    }`}
                  >
                    <td className="py-2 pl-2 align-middle">
                      <span title={HEALTH_LABEL[health]} className={`block h-2.5 w-2.5 rounded-full ${HEALTH_DOT[health]}`} />
                    </td>
                    <td className="max-w-[160px] py-2 pr-2 align-middle font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <Avatar name={client.companyName} photoURL={client.logoUrl} size="xs" />
                        <span className="truncate">{client.companyName}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-2 align-middle">
                      <ServicePill service={service} />
                    </td>
                    <td className="py-2 pr-2 align-middle text-slate-500">{ownerName}</td>
                    <td className="max-w-[160px] truncate py-2 pr-2 align-middle text-slate-500">
                      {canSeeAllTasks ? (nextTask?.title ?? '—') : '—'}
                    </td>
                    <td className={`py-2 pr-2 align-middle text-xs ${canSeeAllTasks && overdueTask ? 'font-bold text-red-600' : 'text-slate-400'}`}>
                      {canSeeAllTasks && overdueTask && <AlertTriangle size={11} className="mr-1 inline -mt-0.5" />}
                      {canSeeAllTasks && nextTask?.dueDate ? format(nextTask.dueDate.toDate(), 'dd MMM', { locale: ptBR }) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
