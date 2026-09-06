import { useState } from 'react'
import { Plus, Users2, CalendarClock } from 'lucide-react'
import { useTeamMembers } from '../hooks/useTeamMembers'
import { TeamMemberFormModal } from '../components/team/TeamMemberFormModal'
import { TeamMemberDrawer } from '../components/team/TeamMemberDrawer'
import { EmergencyInfoModal } from '../components/team/EmergencyInfoModal'
import { OptimizationScheduleSection } from '../components/team/OptimizationScheduleSection'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/FullPageSpinner'
import { EmptyState } from '../components/ui/EmptyState'
import { TEAM_PERMISSION_LABEL, TEAM_MEETINGS, FUTURE_ROLES, type TeamMember } from '../types'

const STATUS_BADGE: Record<TeamMember['status'], string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-500',
}

export function TeamPage() {
  const { data: members, loading } = useTeamMembers()
  const [openMemberId, setOpenMemberId] = useState<string | null>(null)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [creating, setCreating] = useState(false)
  const [emergencyMemberId, setEmergencyMemberId] = useState<string | null>(null)

  const openMember = members.find((m) => m.id === openMemberId) ?? null
  const emergencyMember = members.find((m) => m.id === emergencyMemberId) ?? null
  const activeMembers = members.filter((m) => m.status === 'active')
  const inactiveMembers = members.filter((m) => m.status === 'inactive')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900">Equipe</h1>
          <p className="text-[15px] text-[#64748B]">Perfis, cargos, rotinas e reuniões da equipe Arrow Shot.</p>
        </div>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
          Novo membro
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : members.length === 0 ? (
        <EmptyState
          title="Nenhum membro cadastrado"
          description='Clique em "Novo membro" para montar o time.'
        />
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <Users2 size={15} className="text-slate-400" /> Equipe ativa
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeMembers.map((m) => (
              <button
                key={m.id}
                onClick={() => setOpenMemberId(m.id)}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3.5 text-left shadow-sm transition-shadow hover:shadow-md"
              >
                <Avatar name={m.name} photoURL={m.photoURL} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{m.name}</p>
                  <p className="truncate text-xs text-slate-400">{m.jobTitle || '—'}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge className="bg-brand-50 text-brand-600">{TEAM_PERMISSION_LABEL[m.permission]}</Badge>
                    {!m.userId && <Badge className="bg-slate-100 text-slate-500">Sem login</Badge>}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {inactiveMembers.length > 0 && (
            <>
              <h2 className="mt-2 text-sm font-semibold text-slate-500">Inativos</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {inactiveMembers.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setOpenMemberId(m.id)}
                    className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3.5 text-left opacity-60 shadow-sm transition-opacity hover:opacity-100"
                  >
                    <Avatar name={m.name} photoURL={m.photoURL} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{m.name}</p>
                      <p className="truncate text-xs text-slate-400">{m.jobTitle || '—'}</p>
                      <Badge className={`mt-1.5 ${STATUS_BADGE.inactive}`}>Inativo</Badge>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Cargos futuros</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FUTURE_ROLES.map((role) => (
            <div
              key={role}
              className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3.5 opacity-60"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-500">
                ?
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-600">{role}</p>
                <Badge className="mt-1 bg-slate-200 text-slate-500">Vaga futura</Badge>
              </div>
            </div>
          ))}
        </div>
      </section>

      <OptimizationScheduleSection />

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <CalendarClock size={15} className="text-slate-400" /> Reuniões recorrentes da equipe
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[15px]">
              <thead className="border-b border-slate-100 bg-slate-50 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Reunião</th>
                  <th className="px-4 py-2.5 font-semibold">Quando</th>
                  <th className="px-4 py-2.5 font-semibold">Participantes</th>
                </tr>
              </thead>
              <tbody>
                {TEAM_MEETINGS.map((meeting, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{meeting.title}</td>
                    <td className="px-4 py-2.5 text-slate-600">{meeting.schedule}</td>
                    <td className="px-4 py-2.5 text-slate-500">{meeting.participants}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <TeamMemberDrawer
        key={`member-${openMemberId ?? 'none'}`}
        member={openMember}
        onClose={() => setOpenMemberId(null)}
        onEdit={() => {
          setEditingMember(openMember)
          setOpenMemberId(null)
        }}
        onOpenEmergency={() => setEmergencyMemberId(openMemberId)}
      />
      <EmergencyInfoModal
        key={`emergency-${emergencyMemberId ?? 'closed'}`}
        open={!!emergencyMember}
        onClose={() => setEmergencyMemberId(null)}
        memberId={emergencyMemberId}
        memberName={emergencyMember?.name ?? ''}
      />
      <TeamMemberFormModal open={creating} onClose={() => setCreating(false)} nextOrder={members.length} />
      <TeamMemberFormModal
        open={!!editingMember}
        onClose={() => setEditingMember(null)}
        member={editingMember}
        nextOrder={members.length}
      />
    </div>
  )
}
