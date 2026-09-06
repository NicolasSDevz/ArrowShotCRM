import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../hooks/useNotifications'
import { markAllNotificationsRead, markNotificationRead } from '../../services/notificationService'
import { NOTIFICATION_ICON, NOTIFICATION_ICON_STYLE, formatNotificationTime, resolveNotificationRoute } from '../notifications/notificationMeta'
import type { AppNotification } from '../../types'

export function NotificationBell() {
  const { profile } = useAuth()
  const { notifications, ownNotifications, unreadCount } = useNotifications(profile?.id)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const handleClick = async (n: AppNotification) => {
    if (!n.read) await markNotificationRead(n.id)
    setOpen(false)
    const route = resolveNotificationRoute(n)
    if (route) navigate(route)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-96 rounded-lg border border-slate-100 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
              <p className="text-sm font-semibold text-slate-700">Notificações</p>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllNotificationsRead(ownNotifications)}
                  className="text-xs text-brand-600 hover:text-brand-700"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-slate-400">Nenhuma notificação ainda.</p>
              ) : (
                notifications.slice(0, 30).map((n) => {
                  const Icon = NOTIFICATION_ICON[n.type] ?? Bell
                  const unreadForMe = !n.read
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleClick(n)}
                      className={`flex w-full items-start gap-2.5 border-b border-slate-50 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50 ${
                        unreadForMe ? 'bg-brand-50' : 'bg-white'
                      }`}
                    >
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${NOTIFICATION_ICON_STYLE[n.type] ?? 'bg-slate-100 text-slate-500'}`}>
                        <Icon size={14} />
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
                })
              )}
            </div>
            <button
              onClick={() => {
                setOpen(false)
                navigate('/notificacoes')
              }}
              className="block w-full border-t border-slate-100 px-3 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-slate-50 hover:text-brand-700"
            >
              Ver todas
            </button>
          </div>
        </>
      )}
    </div>
  )
}
