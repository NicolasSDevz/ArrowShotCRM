import { useMemo, useRef, useState } from 'react'
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
  // Abre ao passar o mouse (e fecha ao sair); clicar deixa aberto até clicar fora — útil no celular.
  const [hovering, setHovering] = useState(false)
  const [pinned, setPinned] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const open = hovering || pinned
  const onEnter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setHovering(true)
  }
  const onLeave = () => {
    closeTimer.current = setTimeout(() => setHovering(false), 150)
  }

  const people = useMemo(
    () =>
      users
        .filter((u) => u.active && u.role !== 'client')
        .map((u) => ({ user: u, presence: getPresence(u, now) }))
        .sort((a, b) => Number(b.presence.online) - Number(a.presence.online) || a.user.name.localeCompare(b.user.name)),
    [users, now]
  )
  const onlineCount = people.filter((p) => p.presence.online).length
  // Você sempre está online — o pontinho verde só acende se tem MAIS alguém.
  const othersOnline = people.filter((p) => p.presence.online && p.user.id !== profile?.id)

  return (
    <div className="relative" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button
        onClick={() => setPinned((v) => !v)}
        aria-label="Quem está online"
        aria-expanded={open}
        className="relative rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <Users size={18} />
        {othersOnline.length > 0 && <span className="topbar-stack-ring absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />}
      </button>

      {open && (
        <>
          {pinned && <div className="fixed inset-0 z-10" onClick={() => { setPinned(false); setHovering(false) }} />}
          {/* pt-2 (e não mt-2): o espaço entre o botão e a lista também conta como "em cima", senão fecharia no caminho. */}
          <div className="absolute right-0 z-20 pt-2">
          <div className="w-72 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg">
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
          </div>
        </>
      )}
    </div>
  )
}
