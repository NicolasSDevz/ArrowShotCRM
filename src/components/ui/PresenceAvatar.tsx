import { Avatar } from './Avatar'

/** Avatar com a bolinha de status no canto, no estilo WhatsApp: verde =
 *  online agora, cinza = offline. */
export function PresenceAvatar({
  name,
  photoURL,
  size = 'md',
  online,
}: {
  name: string
  photoURL?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  online: boolean
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar name={name} photoURL={photoURL} size={size} />
      <span
        title={online ? 'Online agora' : 'Offline'}
        className={`presence-dot absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${online ? 'bg-emerald-500' : 'bg-slate-300'}`}
      />
    </span>
  )
}
