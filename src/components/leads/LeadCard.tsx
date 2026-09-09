import { differenceInCalendarDays, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { LEAD_SOURCE_LABEL, type AppUser, type Lead } from '../../types'

function leadServiceLabel(lead: Lead): string {
  const parts: string[] = []
  if (lead.services.paidTraffic) parts.push('Tráfego Pago')
  if (lead.services.socialMedia) parts.push('Social Mídia')
  return parts.length > 0 ? parts.join(' + ') : '—'
}

function daysInStageLabel(stageChangedAt: Lead['stageChangedAt']): string {
  const days = differenceInCalendarDays(new Date(), stageChangedAt.toDate())
  if (days <= 0) return 'hoje nesta etapa'
  return `há ${days} dia${days === 1 ? '' : 's'} nesta etapa`
}

export function LeadCard({ lead, assignee, onClick }: { lead: Lead; assignee?: AppUser; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`flex w-full cursor-pointer flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-colors duration-150 ease-in-out hover:bg-slate-50 ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{lead.contactName}</p>
          {lead.companyName && <p className="truncate text-xs text-slate-400">{lead.companyName}</p>}
        </div>
        <Avatar name={assignee?.name ?? '?'} photoURL={assignee?.photoURL} size="xs" />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Badge className="bg-blue-50 text-blue-600">{leadServiceLabel(lead)}</Badge>
        <Badge className="bg-slate-100 text-[11px] text-slate-500">{LEAD_SOURCE_LABEL[lead.source]}</Badge>
      </div>

      {lead.estimatedValue != null && lead.estimatedValue > 0 && (
        <p className="text-sm font-semibold text-slate-700">
          {lead.estimatedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </p>
      )}

      {lead.nextActionDate && (
        <p className="text-xs text-slate-500">
          Próxima ação: {format(lead.nextActionDate.toDate(), 'dd/MM/yyyy', { locale: ptBR })}
        </p>
      )}

      <p className="text-[11px] text-slate-400">{daysInStageLabel(lead.stageChangedAt)}</p>
    </div>
  )
}
