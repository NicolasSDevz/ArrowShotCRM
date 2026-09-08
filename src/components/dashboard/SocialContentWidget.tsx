import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '../../context/AuthContext'
import { useAllContents } from '../../hooks/useContents'
import { useClients } from '../../hooks/useClients'
import {
  CONTENT_STATUS_LABEL,
  CONTENT_PILLAR_LABEL,
  CONTENT_PILLAR_COLOR,
  type Content,
  type ContentStatus,
  type ContentType,
} from '../../types/content'
import { getClientOwnerIds } from '../../types/client'
import { clientHashColor } from '../../utils/clientColor'

/** Só Ciane e Nicolas veem este widget — cada um focado no que o cargo dele
 *  precisa resolver. Bruno/Janilson não. */
const ROLE_CONFIG: Record<string, { label: string; statuses: ContentStatus[] }> = {
  Ciane: { label: 'Conteúdos para revisar', statuses: ['review', 'waiting_client'] },
  Nicolas: { label: 'Conteúdos para produzir', statuses: ['ideas', 'production'] },
}

/** Dias úteis (seg–sex) de hoje até `target`. 0 se `target` for hoje ou já passou. */
function businessDaysUntil(target: Date): number {
  const a = startOfDay(new Date())
  const b = startOfDay(target)
  if (b <= a) return 0
  let count = 0
  const cur = new Date(a)
  while (cur < b) {
    cur.setDate(cur.getDate() + 1)
    const d = cur.getDay()
    if (d !== 0 && d !== 6) count++
  }
  return count
}

function formatEmoji(t: ContentType): string {
  if (t === 'reels' || t === 'video') return '🎬'
  if (t === 'story') return '📱'
  return '📷'
}

function urgency(days: number): { dot: string; text: string; className: string } {
  if (days <= 0) return { dot: '🔴', text: 'Publica hoje', className: 'text-red-600' }
  if (days <= 2) return { dot: '🔴', text: `Publica em ${days} dia${days === 1 ? '' : 's'}`, className: 'text-red-600' }
  if (days <= 4) return { dot: '🟡', text: `Publica em ${days} dias`, className: 'text-amber-600' }
  return { dot: '🟢', text: `Publica em ${days} dias`, className: 'text-emerald-600' }
}

function ContentRow({
  content,
  clientName,
  clientColor,
  daysLeft,
  onClick,
}: {
  content: Content
  clientName: string
  clientColor: string
  daysLeft: number | null
  onClick: () => void
}) {
  const pillar = content.pillar
  const u = daysLeft != null ? urgency(daysLeft) : null
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1 rounded-lg border border-slate-100 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`text-[11px] font-semibold ${clientColor}`}>{clientName}</span>
        <span className="text-sm font-medium text-slate-800">{content.title}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
        <span>{formatEmoji(content.type)}</span>
        {pillar && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{ color: CONTENT_PILLAR_COLOR[pillar], backgroundColor: `${CONTENT_PILLAR_COLOR[pillar]}24` }}
          >
            {CONTENT_PILLAR_LABEL[pillar]}
          </span>
        )}
        {content.scheduledDate && <span>{format(content.scheduledDate.toDate(), 'dd MMM', { locale: ptBR })}</span>}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
          {CONTENT_STATUS_LABEL[content.status]}
        </span>
        {u && (
          <span className={`ml-auto text-[11px] font-semibold ${u.className}`}>
            {u.dot} {u.text}
          </span>
        )}
      </div>
    </button>
  )
}

export function SocialContentWidget() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { data: contents } = useAllContents()
  const { data: clients } = useClients()

  const firstName = profile?.name.split(' ')[0] ?? ''
  const config = ROLE_CONFIG[firstName]

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])

  const { urgent, fallback } = useMemo(() => {
    if (!profile || !config) return { urgent: [], fallback: [] as Content[] }

    // clientes onde o usuário logado é responsável
    const myClientIds = new Set(
      clients.filter((c) => getClientOwnerIds(c).includes(profile.id)).map((c) => c.id)
    )

    const relevant = contents.filter(
      (c) => myClientIds.has(c.clientId) && config.statuses.includes(c.status)
    )

    const withDays = relevant
      .filter((c) => c.scheduledDate && c.scheduledDate.toDate() >= startOfDay(new Date()))
      .map((c) => ({ content: c, days: businessDaysUntil(c.scheduledDate!.toDate()) }))
      .filter((x) => x.days <= 5)
      .sort((a, b) => a.content.scheduledDate!.toMillis() - b.content.scheduledDate!.toMillis())

    const fallbackList = [...relevant]
      .sort((a, b) => {
        const da = a.scheduledDate?.toMillis() ?? Infinity
        const db = b.scheduledDate?.toMillis() ?? Infinity
        return da - db
      })
      .slice(0, 3)

    return { urgent: withDays, fallback: fallbackList }
  }, [profile, config, contents, clients])

  if (!profile || !config) return null

  const showFallback = urgent.length === 0
  const nothing = showFallback && fallback.length === 0

  return (
    <div
      className="rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
      style={{ borderLeft: '4px solid #EC4899' }}
      data-dash-accent
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-[16px] font-semibold text-slate-900">{config.label}</p>
          <p className="text-[13px] text-[#64748B]">Conteúdos dos seus clientes com publicação nos próximos 5 dias úteis.</p>
        </div>
        {!nothing && (
          <p className="shrink-0 text-[13px] text-[#64748B]">
            {(showFallback ? fallback : urgent).length} conteúdo(s)
          </p>
        )}
      </div>

      {nothing ? (
        <p className="mt-3 text-[14px] font-medium text-[#10B981]">
          ✅ Nenhum conteúdo pendente nos próximos 5 dias úteis
        </p>
      ) : (
        <>
          {showFallback && (
            <p className="mt-3 text-[13px] text-slate-500">Nenhum conteúdo urgente. Próximos a produzir:</p>
          )}

          <div className="mt-3 flex flex-col gap-2">
            {showFallback
              ? fallback.map((c) => (
                  <ContentRow
                    key={c.id}
                    content={c}
                    clientName={clientMap[c.clientId]?.companyName ?? '—'}
                    clientColor={clientHashColor(c.clientId)}
                    daysLeft={null}
                    onClick={() => navigate(`/social-media?content=${c.id}`)}
                  />
                ))
              : urgent.map(({ content, days }) => (
                  <ContentRow
                    key={content.id}
                    content={content}
                    clientName={clientMap[content.clientId]?.companyName ?? '—'}
                    clientColor={clientHashColor(content.clientId)}
                    daysLeft={days}
                    onClick={() => navigate(`/social-media?content=${content.id}`)}
                  />
                ))}
          </div>

          <button
            type="button"
            onClick={() => navigate(`/social-media?assignee=${profile.id}`)}
            className="mt-3 text-[13px] font-medium text-brand-600 hover:text-brand-700"
          >
            Ver todos →
          </button>
        </>
      )}
    </div>
  )
}
