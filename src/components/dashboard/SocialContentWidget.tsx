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
const ROLE_CONFIG: Record<string, { label: string; focus: ContentStatus[] }> = {
  Ciane: { label: 'Conteúdos para revisar', focus: ['review', 'waiting_client'] },
  Nicolas: { label: 'Conteúdos para produzir', focus: ['ideas', 'production'] },
}

/** Status que o widget considera "pendente" (não Aprovado/Agendado/
 *  Publicado/Cancelado). O `focus` do cargo só reordena — nunca esconde. */
const PENDING_STATUSES: ContentStatus[] = ['ideas', 'production', 'review', 'waiting_client']

/** Dias úteis (seg–sex) de hoje até `target`. Negativo se `target` já passou. */
function businessDaysBetween(target: Date): number {
  const a = startOfDay(new Date())
  const b = startOfDay(target)
  if (b.getTime() === a.getTime()) return 0
  const sign = b > a ? 1 : -1
  let count = 0
  const cur = new Date(sign > 0 ? a : b)
  const end = sign > 0 ? b : a
  while (cur < end) {
    cur.setDate(cur.getDate() + 1)
    const d = cur.getDay()
    if (d !== 0 && d !== 6) count++
  }
  return count * sign
}

function formatEmoji(t: ContentType): string {
  if (t === 'reels' || t === 'video') return '🎬'
  if (t === 'story') return '📱'
  return '📷'
}

function urgency(days: number, hasDate: boolean): { dot: string; text: string; className: string } | null {
  if (!hasDate) return { dot: '⚪', text: 'Sem data definida', className: 'text-slate-400' }
  if (days < 0) return { dot: '🔴', text: `Atrasado ${Math.abs(days)}d`, className: 'text-red-600' }
  if (days === 0) return { dot: '🔴', text: 'Publica hoje', className: 'text-red-600' }
  if (days <= 2) return { dot: '🔴', text: `Publica em ${days} dia${days === 1 ? '' : 's'}`, className: 'text-red-600' }
  if (days <= 4) return { dot: '🟡', text: `Publica em ${days} dias`, className: 'text-amber-600' }
  return { dot: '🟢', text: `Publica em ${days} dias`, className: 'text-emerald-600' }
}

interface Row {
  content: Content
  days: number | null
  hasDate: boolean
}

function ContentRow({
  row,
  clientName,
  clientColor,
  onClick,
}: {
  row: Row
  clientName: string
  clientColor: string
  onClick: () => void
}) {
  const { content } = row
  const pillar = content.pillar
  const u = urgency(row.days ?? 0, row.hasDate)
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

  const { urgent, fallback, mine } = useMemo(() => {
    if (!profile || !config) return { urgent: [] as Row[], fallback: [] as Row[], mine: [] as Content[] }

    const myOwnedClientIds = new Set(
      clients.filter((c) => getClientOwnerIds(c).includes(profile.id)).map((c) => c.id)
    )

    // "Meus conteúdos": atribuídos a mim OU, se sem responsável, de um cliente
    // que eu sou responsável. (assignedTo é o sinal principal — foi assim que
    // a pauta foi gerada.)
    const mineList = contents.filter(
      (c) =>
        c.assignedTo === profile.id || (!c.assignedTo && myOwnedClientIds.has(c.clientId))
    )

    const pending = mineList.filter((c) => PENDING_STATUSES.includes(c.status))

    // ordem: foco do cargo primeiro, depois por data (sem data por último)
    const isFocus = (c: Content) => config.focus.includes(c.status)
    const dateMs = (c: Content) => c.scheduledDate?.toMillis() ?? Infinity
    const sorted = [...pending].sort((a, b) => {
      if (isFocus(a) !== isFocus(b)) return isFocus(a) ? -1 : 1
      return dateMs(a) - dateMs(b)
    })

    const rows: Row[] = sorted.map((c) => {
      const hasDate = !!c.scheduledDate
      return { content: c, hasDate, days: hasDate ? businessDaysBetween(c.scheduledDate!.toDate()) : null }
    })

    // urgentes: com data, dentro dos próximos 5 dias úteis (inclui atrasados)
    const urgentRows = rows
      .filter((r) => r.hasDate && (r.days as number) <= 5)
      .sort((a, b) => dateMs(a.content) - dateMs(b.content))

    const fallbackRows = rows.slice(0, 3)

    if (import.meta.env.DEV) {
      console.log('[SocialContentWidget]', {
        usuario: `${profile.name} (${profile.id})`,
        totalConteudosNaBase: contents.length,
        meus_por_assignedTo_ou_cliente: mineList.length,
        com_data: mineList.filter((c) => c.scheduledDate).length,
        em_status_pendente: pending.length,
        por_status: pending.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {}),
        urgentes_proximos_5_dias_uteis: urgentRows.length,
      })
    }

    return { urgent: urgentRows, fallback: fallbackRows, mine: mineList }
  }, [profile, config, contents, clients])

  if (!profile || !config) return null

  const showFallback = urgent.length === 0
  const list = showFallback ? fallback : urgent
  const nothing = list.length === 0

  return (
    <div
      className="rounded-2xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
      style={{ borderLeft: '4px solid #EC4899' }}
      data-dash-accent
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-[16px] font-semibold text-slate-900">{config.label}</p>
          <p className="text-[13px] text-[#64748B]">
            Seus conteúdos com publicação nos próximos 5 dias úteis.
          </p>
        </div>
        {!nothing && <p className="shrink-0 text-[13px] text-[#64748B]">{list.length} conteúdo(s)</p>}
      </div>

      {nothing ? (
        <p className="mt-3 text-[14px] font-medium text-[#10B981]">
          {mine.length === 0
            ? '✅ Nenhum conteúdo atribuído a você'
            : '✅ Nenhum conteúdo pendente nos próximos 5 dias úteis'}
        </p>
      ) : (
        <>
          {showFallback && (
            <p className="mt-3 text-[13px] text-slate-500">Nenhum conteúdo urgente. Próximos a produzir:</p>
          )}

          <div className="mt-3 flex flex-col gap-2">
            {list.map((row) => (
              <ContentRow
                key={row.content.id}
                row={row}
                clientName={clientMap[row.content.clientId]?.companyName ?? '—'}
                clientColor={clientHashColor(row.content.clientId)}
                onClick={() => navigate(`/social-media?content=${row.content.id}`)}
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
