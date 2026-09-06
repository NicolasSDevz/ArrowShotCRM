import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Field, Input, Select } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { createTeamMember, updateTeamMember } from '../../services/teamMemberService'
import { notifyAdminsOfAction } from '../../services/notificationService'
import {
  TEAM_PERMISSION_LABEL,
  ROLE_ROUTINES,
  type TeamMember,
  type TeamPermission,
  type TeamMemberStatus,
  type RoutineKey,
} from '../../types'

const EMPTY = {
  name: '',
  jobTitle: '',
  email: '',
  whatsapp: '',
  permission: 'visualizador' as TeamPermission,
  status: 'active' as TeamMemberStatus,
  userId: '',
  routineKey: '' as RoutineKey | '',
}

export function TeamMemberFormModal({
  open,
  onClose,
  member,
  nextOrder,
}: {
  open: boolean
  onClose: () => void
  member?: TeamMember | null
  nextOrder: number
}) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (member) {
      setForm({
        name: member.name,
        jobTitle: member.jobTitle,
        email: member.email ?? '',
        whatsapp: member.whatsapp ?? '',
        permission: member.permission,
        status: member.status,
        userId: member.userId ?? '',
        routineKey: member.routineKey ?? '',
      })
    } else {
      setForm(EMPTY)
    }
  }, [member, open])

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async () => {
    if (!form.name.trim() || !profile) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        jobTitle: form.jobTitle.trim(),
        email: form.email || undefined,
        whatsapp: form.whatsapp || undefined,
        permission: form.permission,
        status: form.status,
        userId: form.userId || undefined,
        routineKey: form.routineKey || undefined,
        order: member?.order ?? nextOrder,
      }
      if (member) {
        await updateTeamMember(member.id, payload, profile.id)
        toast.success('Perfil atualizado')
      } else {
        await createTeamMember(payload, profile.id)
        await notifyAdminsOfAction({
          type: 'team_member_added',
          message: `${profile.name} adicionou ${payload.name} à equipe${payload.jobTitle ? ` (${payload.jobTitle})` : ''}`,
          actorId: profile.id,
          actorName: profile.name,
        })
        toast.success('Membro adicionado')
      }
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar perfil')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={member ? 'Editar perfil' : 'Novo membro da equipe'}>
      <div className="flex flex-col gap-3">
        <Field label="Nome" required>
          <Input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>

        <Field label="Cargo">
          <Input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} placeholder="Ex: Sócio / Closer" />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="E-mail">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="WhatsApp">
            <Input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="(11) 99999-9999" />
          </Field>

          <Field label="Permissão na plataforma">
            <Select value={form.permission} onChange={(e) => set('permission', e.target.value as TeamPermission)}>
              {Object.entries(TEAM_PERMISSION_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status">
            <Select value={form.status} onChange={(e) => set('status', e.target.value as TeamMemberStatus)}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </Select>
          </Field>

          <Field label="Rotina diária">
            <Select value={form.routineKey} onChange={(e) => set('routineKey', e.target.value as RoutineKey | '')}>
              <option value="">Nenhuma</option>
              {(Object.entries(ROLE_ROUTINES) as [RoutineKey, (typeof ROLE_ROUTINES)[RoutineKey]][]).map(([v, r]) => (
                <option key={v} value={v}>
                  {r.title}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Conta de login vinculada">
            <Select value={form.userId} onChange={(e) => set('userId', e.target.value)}>
              <option value="">Nenhuma (ainda sem acesso)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!form.name.trim()}>
            {member ? 'Salvar' : 'Adicionar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
