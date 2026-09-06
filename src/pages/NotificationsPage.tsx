import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import { markAllNotificationsRead, markNotificationRead } from '../services/notificationService'
import { NOTIFICATION_ICON, NOTIFICATION_ICON_STYLE, formatNotificationTime, resolveNotificationRoute } from '../components/notifications/notificationMeta'
import { NOTIFICATION_TYPE_LABEL, type AppNotification, type NotificationType } from '../types'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'

type ReadFilter = 'all' | 'unread'

const PAGE_SIZE = 20

export function NotificationsPage() {
  const { profile } = useAuth()
  const { notifications, ownNotifications, unreadCount } = useNotifications(profile?.id, profile?.role === 'admin')
  const navigate = useNavigate()

  const [readFilter, setReadFilter] = useState<ReadFilter>('all')
  const [typeFilter, setTypeFilter] = useState<NotificationType | ''>('')
  const [page, setPage] = useState(0)

  // Only offer types that actually occur, so the dropdown doesn't list 15
  // options when this account has only ever seen 3 of them.
  const typesPresent = useMemo(
    () =>
      Array.from(new Set(notifications.map((n) => n.type))).sort((a, b) =>
        (NOTIFICATION_TYPE_LABEL[a] ?? a).localeCompare(NOTIFICATION_TYPE_LABEL[b] ?? b)
      ),
    [notifications]
  )

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      // "Não lidas" only makes sense for the viewer's own notifications —
      // `read` isn't per-viewer, so someone else's notification is neither
      // "mine to mark" nor meaningfully "unread for me".
      if (readFilter === 'unread' && (n.read || n.userId !== profile?.id)) return false
      if (typeFilter && n.type !== typeFilter) return false
      return true
    })
  }, [notifications, readFilter, typeFilter, profile?.id])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages - 1)
  const pageItems = filtered.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE)

  const changeFilter = (fn: () => void) => {
    fn()
    setPage(0)
  }

  const handleClick = async (n: AppNotification) => {
    if (!n.read && n.userId === profile?.id) await markNotificationRead(n.id)
    const route = resolveNotificationRoute(n)
    if (route) navigate(route)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-[28px] font-extrabold text-slate-900">
            <Bell size={24} /> Notificações
          </h1>
          <p className="text-[15px] text-[#64748B]">{unreadCount} não lida{unreadCount === 1 ? '' : 's'}</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" onClick={() => markAllNotificationsRead(ownNotifications)}>
            Marcar todas como lidas
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 p-0.5">
          <button
            onClick={() => changeFilter(() => setReadFilter('all'))}
            className={`rounded-md px-3 py-1 text-xs font-medium ${readFilter === 'all' ? 'bg-brand-100 text-brand-700' : 'text-slate-500'}`}
          >
            Todas
          </button>
          <button
            onClick={() => changeFilter(() => setReadFilter('unread'))}
            className={`rounded-md px-3 py-1 text-xs font-medium ${readFilter === 'unread' ? 'bg-brand-100 text-brand-700' : 'text-slate-500'}`}
          >
            Não lidas
          </button>
        </div>
        <select
          value={typeFilter}
          onChange={(e) => changeFilter(() => setTypeFilter(e.target.value as NotificationType | ''))}
          className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Todos os tipos</option>
          {typesPresent.map((t) => (
            <option key={t} value={t}>{NOTIFICATION_TYPE_LABEL[t] ?? t}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nenhuma notificação encontrada" description="Ajuste os filtros ou volte mais tarde." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
          {pageItems.map((n) => {
            const Icon = NOTIFICATION_ICON[n.type] ?? Bell
            const unreadForMe = !n.read && n.userId === profile?.id
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`flex w-full items-start gap-3 border-b border-slate-50 px-4 py-3 text-left last:border-0 hover:bg-slate-50 ${
                  unreadForMe ? 'bg-brand-50' : 'bg-white'
                }`}
              >
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${NOTIFICATION_ICON_STYLE[n.type] ?? 'bg-slate-100 text-slate-500'}`}>
                  <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`whitespace-pre-line text-[14px] leading-snug ${unreadForMe ? 'font-medium text-slate-800' : 'text-slate-600'}`}>
                    {n.message}
                  </p>
                  {n.actorName && <p className="mt-0.5 text-[12px] text-[#64748B]">{n.actorName}</p>}
                  <p className="mt-0.5 text-[12px] text-[#94A3B8]">
                    {n.createdAt ? formatNotificationTime(n.createdAt.toDate()) : ''}
                  </p>
                </div>
                {unreadForMe && <span className="ml-auto mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
              </button>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={pageSafe === 0}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft size={15} />
          </button>
          <p className="text-xs text-slate-500">Página {pageSafe + 1} de {totalPages}</p>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={pageSafe >= totalPages - 1}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
