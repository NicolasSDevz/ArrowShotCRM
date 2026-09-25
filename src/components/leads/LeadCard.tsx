import { differenceInCalendarDays, differenceInHours, format } from 'date-fns'
import { ClipboardList } from 'lucide-react'
import { ptBR } from 'date-fns/locale'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { PrivateMoney } from '../ui/PrivateData'
import { usePrivacy } from '../../context/PrivacyContext'
import { LEAD_SOURCE_LABEL, formatFieldValue, type AppUser, type Lead, type PipelineField } from '../../types'
import type { LeadFormTag } from './leadFormColors'

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

export function LeadCard({
  lead,
  assignee,
  onClick,
  fields = [],
  formTag,
}: {
  lead: Lead
  assignee?: AppUser
  onClick: () => void
  fields?: PipelineField[]
  /** Formulário de onde o lead veio (nome + cor) — deixa o cartão colorido. */
  formTag?: LeadFormTag
}) {
  // "Novo" nas primeiras 24h depois de chegar pelo formulário.
  const isFresh = !!formTag && !!lead.createdAt && differenceInHours(new Date(), lead.createdAt.toDate()) < 24
  const { isPrivacyMode } = usePrivacy()
  const cardFields = fields
    .filter((f) => f.showOnCard)
    .map((f) => ({ f, text: formatFieldValue(f, lead.customFields?.[f.id]) }))
    .filter((x) => x.text)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...(formTag ? { borderLeft: `4px solid ${formTag.color}` } : {}),
      }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`flex w-full cursor-pointer flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-colors duration-150 ease-in-out hover:bg-slate-50 ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      {formTag && (
        <div className="-mt-0.5 flex items-center gap-1.5">
          <span
            className="inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
            style={{ background: `${formTag.color}1F`, color: formTag.color }}
            title="Formulário de onde o lead veio"
          >
            <ClipboardList size={11} className="shrink-0" />
            <span className="truncate">{formTag.name}</span>
          </span>
          {isFresh && (
            <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white" style={{ background: formTag.color }}>
              Novo
            </span>
          )}
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">
            {isPrivacyMode ? 'Lead ••••••' : lead.contactName}
          </p>
          {lead.companyName && (
            <p className="truncate text-xs text-slate-400">{isPrivacyMode ? 'Empresa ••••••' : lead.companyName}</p>
          )}
        </div>
        <Avatar name={assignee?.name ?? '?'} photoURL={assignee?.photoURL} size="xs" />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Badge className="bg-blue-50 text-blue-600">{leadServiceLabel(lead)}</Badge>
        {lead.services.landingPage && <Badge className="badge-service-landing">Landing Page</Badge>}
        {!formTag && <Badge className="bg-slate-100 text-[11px] text-slate-500">{LEAD_SOURCE_LABEL[lead.source]}</Badge>}
      </div>

      {cardFields.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {cardFields.map(({ f, text }) => (
            <p key={f.id} className="truncate text-xs text-slate-500">
              <span className="text-slate-400">{f.label}:</span> {text}
            </p>
          ))}
        </div>
      )}

      {lead.estimatedValue != null && lead.estimatedValue > 0 && (
        <p className="text-sm font-semibold text-slate-700">
          <PrivateMoney value={lead.estimatedValue} />
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
