import type { ReactNode } from 'react'
import { format, isBefore, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Image, Clapperboard, Circle, Images, Share2, Trash2, Check, type LucideIcon } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Avatar } from '../ui/Avatar'
import { CONTENT_PILLAR_LABEL, CONTENT_PILLAR_COLOR, CONTENT_FORMAT_LABEL, CONTENT_TYPE_LABEL, type Content, type ContentStatus } from '../../types/content'
import { clientHashColor } from '../../utils/clientColor'
import { businessDaysBetween } from '../../utils/businessDays'
import type { AppUser, Client } from '../../types'

/** Status que ainda não "fecharam" o conteúdo — antes de Aprovado. Data
 *  vencendo aqui é o que importa; depois de aprovado é o esperado. */
const PRE_APPROVAL_STATUSES: ContentStatus[] = ['ideas', 'production', 'review', 'waiting_client']

function deadline(content: Content): 'late' | 'soon' | null {
  if (!content.scheduledDate || !PRE_APPROVAL_STATUSES.includes(content.status)) return null
  const d = content.scheduledDate.toDate()
  if (isBefore(d, startOfDay(new Date()))) return 'late'
  return businessDaysBetween(d) < 3 ? 'soon' : null
}

const FORMAT_ICON: Record<Content['type'], LucideIcon> = {
  post: Image,
  carousel: Images,
  reels: Clapperboard,
  story: Circle,
  video: Clapperboard,
  other: Share2,
}

/** Sinal de "pronto" (legenda / arte): cinza quando falta, verde quando tem. */
function Ready({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${ok ? 'text-emerald-600' : 'text-slate-400'}`}>
      {ok ? <Check size={11} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full border border-current" />}
      {label}
    </span>
  )
}

export function ContentCard({
  content,
  client,
  assignee,
  onClick,
  onDelete,
  footer,
}: {
  content: Content
  /** Só passe quando o quadro mistura clientes — dentro do cliente é ruído. */
  client?: Client
  assignee?: AppUser
  onClick: () => void
  onDelete?: () => void
  /** Ação/aviso embaixo do cartão (ex.: "Marcar como agendado"). */
  footer?: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: content.id })
  const FormatIcon = FORMAT_ICON[content.type]
  const date = content.scheduledDate?.toDate()
  const due = deadline(content)
  const media = content.media ?? []
  const thumb = media[0]

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`group relative cursor-pointer rounded-xl border border-slate-100 bg-white p-3 transition-shadow duration-150 hover:shadow-md ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 pr-5 text-[11px] text-slate-400">
            <FormatIcon size={12} className="shrink-0" />
            <span>{CONTENT_FORMAT_LABEL[content.type] ?? CONTENT_TYPE_LABEL[content.type]}</span>
            {date && (
              <>
                <span>·</span>
                <span className={due === 'late' ? 'font-semibold text-red-500' : due === 'soon' ? 'font-semibold text-amber-500' : ''}>
                  {format(date, 'EEE dd/MM', { locale: ptBR })}
                  {due === 'late' && ' · atrasado'}
                </span>
              </>
            )}
          </div>

          {client && <p className={`mt-1 truncate text-[11px] font-medium ${clientHashColor(client.id)}`}>{client.companyName}</p>}

          <p className="mt-1 line-clamp-2 text-[13.5px] font-semibold leading-snug text-slate-800">{content.title}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {content.pillar && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CONTENT_PILLAR_COLOR[content.pillar] }} />
                {CONTENT_PILLAR_LABEL[content.pillar]}
              </span>
            )}
            <Ready ok={!!content.caption?.trim()} label="legenda" />
            <Ready ok={media.length > 0} label={media.length > 1 ? `arte (${media.length})` : 'arte'} />
          </div>
        </div>

        {thumb && (
          <div className="h-[60px] w-12 shrink-0 overflow-hidden rounded-md bg-slate-100">
            {thumb.kind === 'video' ? (
              <video src={thumb.url} muted preload="metadata" className="h-full w-full object-cover" />
            ) : (
              <img src={thumb.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
          </div>
        )}
      </div>

      {(footer || assignee) && (
        <div className="mt-2.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <div className="min-w-0 flex-1">{footer}</div>
          {assignee && <Avatar name={assignee.name} photoURL={assignee.photoURL} size="xs" />}
        </div>
      )}

      {onDelete && (
        <button
          type="button"
          title="Apagar post"
          aria-label="Apagar post"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute right-1.5 top-1.5 rounded-md p-1 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}
