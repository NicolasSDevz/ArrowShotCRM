import { useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { useUsers } from '../../hooks/useUsers'
import { useNow } from '../../hooks/useNow'
import { useAuth } from '../../context/AuthContext'
import { PresenceAvatar } from '../ui/PresenceAvatar'
import { getPresence } from '../../utils/presence'

/** Botão da barra superior "quem está online" — abre uma lista estilo
 *  contatos do WhatsApp: quem está com o CRM aberto agora primeiro (bolinha
 *  verde), depois os offline com "visto há X". Só equipe interna. */
export function TeamPresence() {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const now = useNow()
  const [open, setOpen] = useState(false)

  const people = useMemo(
    () =>
      users
        .filter((u) => u.active && u.role !== 'client')
        .map((u) => ({ user: u, presence: getPresence(u.lastSeenAt, now) }))
        .sort((a, b) => Number(b.presence.online) - Number(a.presence.online) || a.user.name.localeCompare(b.user.name)),
    [users, now]
  )
  const onlineCount = people.filter((p) => p.presence.online).length

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Quem está online"
        aria-label="Quem está online"
        className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        <Users size={18} />
        {onlineCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold leading-none text-white">
            {onlineCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg">
            <div className="border-b border-slate-100 px-3.5 py-2.5">
              <p className="text-sm font-semibold text-slate-800">Equipe</p>
              <p className="text-xs text-slate-400">
                {onlineCount === 0 ? 'Ninguém online agora' : `${onlineCount} online agora`}
              </p>
            </div>
            <ul className="max-h-80 overflow-y-auto py-1">
              {people.map(({ user, presence }) => (
                <li key={user.id} className="flex items-center gap-3 px-3.5 py-2">
                  <PresenceAvatar name={user.name} photoURL={user.photoURL} size="md" online={presence.online} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {user.name}
                      {user.id === profile?.id && <span className="ml-1 text-xs font-normal text-slate-400">(você)</span>}
                    </p>
                    <p className={`truncate text-xs ${presence.online ? 'font-medium text-emerald-600' : 'text-slate-400'}`}>{presence.label}</p>
                  </div>
                </li>
              ))}
              {people.length === 0 && <li className="px-3.5 py-3 text-sm text-slate-400">Ninguém cadastrado ainda.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
