import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarClock, Image, Clapperboard, Circle, Images, Share2, type LucideIcon } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { CONTENT_PILLAR_LABEL, CONTENT_PILLAR_COLOR, CONTENT_FORMAT_LABEL, CONTENT_TYPE_LABEL, type Content } from '../../types/content'
import { clientHashColor } from '../../utils/clientColor'
import type { AppUser, Client } from '../../types'

const FORMAT_ICON: Record<Content['type'], LucideIcon> = {
  post: Image,
  carousel: Images,
  reels: Clapperboard,
  story: Circle,
  video: Clapperboard,
  other: Share2,
}

/** Chip do pilar — cor central (CONTENT_PILLAR_COLOR): texto na cor cheia,
 *  fundo bem sutil (mesma cor a ~14%). Funciona em claro e escuro. */
function PillarChip({ pillar }: { pillar: NonNullable<Content['pillar']> }) {
  const hex = CONTENT_PILLAR_COLOR[pillar]
  return (
    <span
      className="badge inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ color: hex, backgroundColor: `${hex}24`, border: `1px solid ${hex}40` }}
    >
      {CONTENT_PILLAR_LABEL[pillar]}
    </span>
  )
}

export function ContentCard({
  content,
  client,
  assignee,
  onClick,
}: {
  content: Content
  client?: Client
  assignee?: AppUser
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: content.id })
  const FormatIcon = FORMAT_ICON[content.type]
  const date = content.scheduledDate?.toDate()

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...(content.pillar ? { borderLeftColor: CONTENT_PILLAR_COLOR[content.pillar] } : {}),
      }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`cursor-pointer rounded-[10px] border border-slate-100 bg-white p-[14px] shadow-sm transition-all duration-150 ease-in-out hover:shadow-md ${
        content.pillar ? 'border-l-4' : ''
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      {client && (
        <p className={`mb-1 truncate text-[11px] font-medium ${clientHashColor(client.id)}`}>{client.companyName}</p>
      )}
      <p className="text-sm font-semibold text-slate-900">{content.title}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge className="bg-slate-100 text-slate-500">
          <FormatIcon size={11} /> {CONTENT_FORMAT_LABEL[content.type] ?? CONTENT_TYPE_LABEL[content.type]}
        </Badge>
        {content.pillar && <PillarChip pillar={content.pillar} />}
        {date && (
          <Badge className="bg-slate-100 text-slate-500">
            <CalendarClock size={11} />
            {format(date, 'dd MMM', { locale: ptBR })}
            {content.scheduledTime ? ` ${content.scheduledTime}` : ''}
          </Badge>
        )}
      </div>

      {assignee && (
        <div className="mt-2 flex justify-end">
          <Avatar name={assignee.name} photoURL={assignee.photoURL} size="xs" />
        </div>
      )}
    </div>
  )
}
