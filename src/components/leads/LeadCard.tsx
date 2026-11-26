import { differenceInCalendarDays, differenceInHours, format } from 'date-fns'
import { ClipboardList, MessageCircle } from 'lucide-react'
import type { WaConversation } from '../../types/whatsapp'
import { SdrChip } from '../whatsapp/SdrChip'
import { callbackDayLabel } from '../whatsapp/WaCallback'
import { ptBR } from 'date-fns/locale'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { PrivateMoney } from '../ui/PrivateData'
import { usePrivacy } from '../../context/PrivacyContext'
import { LEAD_TEMPERATURE_BADGE, LEAD_TEMPERATURE_LABEL, bantTotal, formatFieldValue, leadTemperature, type AppUser, type Lead, type PipelineField } from '../../types'
import type { LeadFormTag } from './leadFormColors'

function leadServiceLabel(lead: Lead): string {
  const parts: string[] = []
  if (lead.services.paidTraffic) parts.push('Tráfego Pago')
  if (lead.services.socialMedia) parts.push('Social Mídia')
  if (lead.services.landingPage) parts.push('Landing Page')
  return parts.length > 0 ? parts.join(' + ') : '—'
}

/** Lead parado há mais que isso numa etapa aberta fica em destaque. */
const STALE_DAYS = 3

function daysInStage(stageChangedAt: Lead['stageChangedAt']): number {
  return Math.max(0, differenceInCalendarDays(new Date(), stageChangedAt.toDate()))
}

function daysInStageLabel(days: number, stale: boolean): string {
  if (days <= 0) return 'entrou hoje nesta etapa'
  return `${stale ? 'parado há' : 'há'} ${days} dia${days === 1 ? '' : 's'} nesta etapa`
}

export function LeadCard({
  lead,
  assignee,
  onClick,
  fields = [],
  formTag,
  existingClientName,
  wa,
  openStage = true,
}: {
  lead: Lead
  assignee?: AppUser
  onClick: () => void
  fields?: PipelineField[]
  /** Formulário de onde o lead veio (nome + cor) — deixa o cartão colorido. */
  formTag?: LeadFormTag
  /** Cliente já cadastrado com o mesmo contato (lead ainda não vinculado). */
  existingClientName?: string
  /** Conversa do WhatsApp desse lead (mostra a última mensagem e as não lidas). */
  wa?: WaConversation
  /** Etapa aberta (não é ganho nem perdido): só aí "parado há X dias" acende. */
  openStage?: boolean
}) {
  // "Novo" nas primeiras 24h depois de chegar pelo formulário.
  const isFresh = !!formTag && !!lead.createdAt && differenceInHours(new Date(), lead.createdAt.toDate()) < 24
  const { isPrivacyMode } = usePrivacy()
  const temperature = leadTemperature(lead.bant)
  const cardFields = fields
    .filter((f) => f.showOnCard)
    .map((f) => ({ f, text: formatFieldValue(f, lead.customFields?.[f.id]) }))
    .filter((x) => x.text)
  const days = daysInStage(lead.stageChangedAt)
  const stale = openStage && days > STALE_DAYS
  const hasMeta = (lead.estimatedValue ?? 0) > 0 || !!lead.nextActionDate
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

      {(temperature || leadServiceLabel(lead) !== '—' || existingClientName) && (
        <div className="flex flex-wrap items-center gap-1">
          {temperature && (
            <Badge className={`${LEAD_TEMPERATURE_BADGE[temperature]} font-semibold`} title={`BANT ${bantTotal(lead.bant)} de 12`}>
              {LEAD_TEMPERATURE_LABEL[temperature]}
            </Badge>
          )}
          {leadServiceLabel(lead) !== '—' && <Badge className="bg-blue-50 text-blue-600">{leadServiceLabel(lead)}</Badge>}
          {existingClientName && (
            <Badge className="bg-amber-50 text-[11px] text-amber-700" title={isPrivacyMode ? undefined : `Já é cliente: ${existingClientName}`}>
              Já é cliente
            </Badge>
          )}
        </div>
      )}

      {cardFields.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {cardFields.map(({ f, text }) => (
            <p key={f.id} className="truncate text-xs text-slate-500">
              <span className="text-slate-400">{f.label}:</span> {text}
            </p>
          ))}
        </div>
      )}

      {hasMeta && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
          {lead.estimatedValue != null && lead.estimatedValue > 0 && (
            <span className="text-sm font-semibold text-slate-700">
              <PrivateMoney value={lead.estimatedValue} />
            </span>
          )}
          {lead.nextActionDate && (
            <span>
              {lead.estimatedValue ? '· ' : ''}Próxima ação {format(lead.nextActionDate.toDate(), 'dd/MM', { locale: ptBR })}
            </span>
          )}
        </p>
      )}

      {wa && wa.lastMessageText && (
        <p
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${wa.unread > 0 ? 'bg-emerald-500/15 text-slate-700' : 'bg-slate-50 text-slate-500'}`}
          aria-label={`WhatsApp: ${wa.unread > 0 ? `${wa.unread} mensagem${wa.unread === 1 ? '' : 's'} não lida${wa.unread === 1 ? '' : 's'}. ` : ''}Última ${wa.lastDirection === 'in' ? 'do lead' : 'nossa'}: ${wa.lastMessageText}`}
        >
          <MessageCircle size={12} className="shrink-0 text-emerald-500" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {wa.lastDirection === 'out' ? 'Você: ' : ''}
            {isPrivacyMode ? '••••••' : wa.lastMessageText}
          </span>
          {wa.unread > 0 && <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">{wa.unread}</span>}
        </p>
      )}

      {(wa?.sdr || lead.whatsSdr) && (
        <div className="flex flex-wrap items-center gap-1">
          <SdrChip sdr={(wa?.sdr ?? lead.whatsSdr) as WaConversation['sdr']} size="xs" />
          {(wa?.sdr ?? lead.whatsSdr)?.meeting?.agreed && <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-400">Reunião combinada</span>}
          {(wa ? wa.callback : lead.whatsCallback)?.status === 'pending' && (
            <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-sky-400">Retomar {callbackDayLabel((wa ? wa.callback : lead.whatsCallback)!.date)}</span>
          )}
        </div>
      )}

      <p className={`text-[11px] ${stale ? 'font-semibold text-amber-600' : 'text-slate-400'}`}>{daysInStageLabel(days, stale)}</p>
    </div>
  )
}
