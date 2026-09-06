import { useState } from 'react'
import toast from 'react-hot-toast'
import { Mail, Phone, Pencil, Trash2, ListChecks, HeartPulse, Siren } from 'lucide-react'
import { Drawer } from '../ui/Drawer'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Select } from '../ui/Field'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { deleteTeamMember } from '../../services/teamMemberService'
import { updateUserRole, updateUserActive } from '../../services/userService'
import { USER_ROLE_LABEL } from '../../types/user'
import type { UserRole } from '../../types/common'
import {
  TEAM_PERMISSION_LABEL,
  ROLE_ROUTINES,
  type TeamMember,
} from '../../types'
import { MemberHealthTab } from './MemberHealthTab'

const STATUS_BADGE: Record<TeamMember['status'], string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-500',
}

export function TeamMemberDrawer({
  member,
  onClose,
  onEdit,
  onOpenEmergency,
}: {
  member: TeamMember | null
  onClose: () => void
  onEdit: () => void
  onOpenEmergency: () => void
}) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const [tab, setTab] = useState<'profile' | 'health'>('profile')

  if (!member) return null

  const isAdmin = profile?.role === 'admin'
  const linkedUser = member.userId ? users.find((u) => u.id === member.userId) : undefined
  const routine = member.routineKey ? ROLE_ROUTINES[member.routineKey] : undefined
  const isSelf = linkedUser?.id === profile?.id
  const otherActiveAdmins = users.filter((u) => u.id !== linkedUser?.id && u.role === 'admin' && u.active).length

  const handleDelete = async () => {
    if (!confirm(`Remover "${member.name}" da equipe?`)) return
    try {
      await deleteTeamMember(member.id)
      toast.success('Membro removido')
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao remover o membro')
    }
  }

  const handleRoleChange = async (role: UserRole) => {
    if (!linkedUser || !profile || role === linkedUser.role) return
    if (linkedUser.role === 'admin' && role !== 'admin' && otherActiveAdmins === 0) {
      toast.error('Não é possível rebaixar o último administrador ativo.')
      return
    }
    if (!confirm(`Alterar o papel de ${member.name} para "${USER_ROLE_LABEL[role]}"?`)) return
    try {
      await updateUserRole(linkedUser.id, role, profile.id)
      toast.success('Papel atualizado')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao atualizar papel')
    }
  }

  const handleToggleActive = async () => {
    if (!linkedUser || !profile) return
    if (linkedUser.active && linkedUser.role === 'admin' && otherActiveAdmins === 0) {
      toast.error('Não é possível desativar o último administrador ativo.')
      return
    }
    try {
      await updateUserActive(linkedUser.id, !linkedUser.active, profile.id)
      toast.success(linkedUser.active ? 'Acesso desativado' : 'Acesso reativado')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao atualizar acesso')
    }
  }

  return (
    <Drawer open={!!member} onClose={onClose} title={member.name}>
      {isAdmin && (
        <div className="flex gap-1 border-b border-slate-100 px-5">
          <button
            onClick={() => setTab('profile')}
            className={`border-b-2 px-2 py-2.5 text-sm font-medium transition-colors ${
              tab === 'profile'
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            Perfil
          </button>
          <button
            onClick={() => setTab('health')}
            className={`flex items-center gap-1.5 border-b-2 px-2 py-2.5 text-sm font-medium transition-colors ${
              tab === 'health'
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <HeartPulse size={14} /> Informações de Saúde
          </button>
        </div>
      )}

      {isAdmin && tab === 'health' ? (
        <div className="px-5 py-4">
          <MemberHealthTab memberId={member.id} />
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <Avatar name={member.name} photoURL={member.photoURL ?? linkedUser?.photoURL} size="md" />
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-800">{member.name}</p>
              <p className="truncate text-sm text-slate-400">{member.jobTitle || '—'}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className="bg-brand-50 text-brand-600">{TEAM_PERMISSION_LABEL[member.permission]}</Badge>
            <Badge className={STATUS_BADGE[member.status]}>{member.status === 'active' ? 'Ativo' : 'Inativo'}</Badge>
          </div>

          <div className="flex flex-col gap-1.5 text-sm text-slate-600">
            {member.email && (
              <span className="flex items-center gap-2">
                <Mail size={14} className="text-slate-400" /> {member.email}
              </span>
            )}
            {member.whatsapp && (
              <span className="flex items-center gap-2">
                <Phone size={14} className="text-slate-400" /> {member.whatsapp}
              </span>
            )}
          </div>

          <Button
            variant="secondary"
            size="sm"
            icon={<Siren size={13} className="text-red-500" />}
            onClick={onOpenEmergency}
            className="self-start"
          >
            Ver informações de emergência
          </Button>

          {linkedUser && profile && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Acesso à plataforma</p>
              {isSelf ? (
                <p className="text-sm text-slate-600">
                  {USER_ROLE_LABEL[linkedUser.role]} · {linkedUser.active ? 'Ativo' : 'Inativo'}
                </p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={linkedUser.role}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className="sm:w-40"
                  >
                    {Object.entries(USER_ROLE_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                  <Button variant="secondary" size="sm" onClick={handleToggleActive}>
                    {linkedUser.active ? 'Desativar acesso' : 'Reativar acesso'}
                  </Button>
                </div>
              )}
            </div>
          )}

          {routine && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <ListChecks size={13} /> {routine.title}
              </p>
              <ul className="flex flex-col gap-1.5">
                {routine.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-2 flex gap-2">
            <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={onEdit}>
              Editar
            </Button>
            <Button variant="danger" size="sm" icon={<Trash2 size={13} />} onClick={handleDelete}>
              Remover
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  )
}
