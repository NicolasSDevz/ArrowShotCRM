import { useState, type ReactNode } from 'react'
import { Plus, Users2, CalendarClock, Briefcase } from 'lucide-react'
import { useTeamMembers } from '../hooks/useTeamMembers'
import { useUsers } from '../hooks/useUsers'
import { useNow } from '../hooks/useNow'
import { getPresence } from '../utils/presence'
import { PresenceAvatar } from '../components/ui/PresenceAvatar'
import { TeamMemberFormModal } from '../components/team/TeamMemberFormModal'
import { TeamMemberDrawer } from '../components/team/TeamMemberDrawer'
import { EmergencyInfoModal } from '../components/team/EmergencyInfoModal'
import { OptimizationScheduleSection } from '../components/team/OptimizationScheduleSection'
import { TeamMeetingsSection } from '../components/team/TeamMeetingsSection'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/FullPageSpinner'
import { EmptyState } from '../components/ui/EmptyState'
import { StatCard } from '../components/ui/StatCard'
import { TEAM_PERMISSION_LABEL, FUTURE_ROLES, type TeamMember, type TeamPermission } from '../types'

const STATUS_BADGE: Record<TeamMember['status'], string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-500',
}

const PERMISSION_BADGE: Record<TeamPermission, string> = {
  admin: 'bg-indigo-50 text-indigo-600',
  gestor: 'bg-blue-50 text-blue-600',
  cs: 'bg-emerald-50 text-emerald-600',
  visualizador: 'bg-slate-100 text-slate-500',
}

function SectionTitle({ icon, iconBg, children }: { icon: ReactNode; iconBg: string; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${iconBg}`}>{icon}</span>
      {children}
    </h2>
  )
}

export function TeamPage() {
  const { data: members, loading } = useTeamMembers()
  const { data: users } = useUsers()
  const now = useNow()
  const [onlyOnline, setOnlyOnline] = useState(false)
  const [openMemberId, setOpenMemberId] = useState<string | null>(null)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [creating, setCreating] = useState(false)
  const [emergencyMemberId, setEmergencyMemberId] = useState<string | null>(null)

  const openMember = members.find((m) => m.id === openMemberId) ?? null
  const emergencyMember = members.find((m) => m.id === emergencyMemberId) ?? null
  // Presença vem do perfil de login (users/{uid}.lastSeenAt) ligado ao membro.
  const presenceOf = (m: TeamMember) => {
    const u = m.userId ? users.find((x) => x.id === m.userId) : undefined
    return m.userId ? getPresence(u ?? {}, now) : null
  }
  // Estilo WhatsApp: quem está online aparece primeiro.
  const activeMembers = members
    .filter((m) => m.status === 'active')
    .map((m, i) => ({ m, i, online: presenceOf(m)?.online ?? false }))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.i - b.i)
    .map((x) => x.m)
  const onlineCount = activeMembers.filter((m) => presenceOf(m)?.online).length
  const visibleActive = onlyOnline ? activeMembers.filter((m) => presenceOf(m)?.online) : activeMembers
  const inactiveMembers = members.filter((m) => m.status === 'inactive')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900">Equipe</h1>
          <p className="text-[15px] text-[#64748B]">Perfis, cargos, rotinas e reuniões da equipe Quiver.</p>
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
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Online agora" value={onlineCount} />
            <StatCard label="Membros ativos" value={activeMembers.length} />
            <StatCard label="Com acesso à plataforma" value={members.filter((m) => !!m.userId).length} />
            <StatCard label="Cargos futuros em aberto" value={FUTURE_ROLES.length} />
          </div>

        <section className="flex flex-col gap-3">
          <SectionTitle icon={<Users2 size={13} className="text-white" />} iconBg="bg-brand-500">
            Equipe ativa
          </SectionTitle>
          <label className="flex w-fit items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={onlyOnline} onChange={(e) => setOnlyOnline(e.target.checked)} />
            Mostrar só quem está online
          </label>
          {visibleActive.length === 0 && <p className="text-sm text-slate-400">Ninguém online agora.</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleActive.map((m) => {
              const presence = presenceOf(m)
              return (
              <button
                key={m.id}
                onClick={() => setOpenMemberId(m.id)}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition-all duration-150 ease-in-out hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
              >
                {presence ? (
                  <PresenceAvatar name={m.name} photoURL={m.photoURL} size="lg" online={presence.online} />
                ) : (
                  <Avatar name={m.name} photoURL={m.photoURL} size="lg" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{m.name}</p>
                  <p className="truncate text-xs text-slate-400">{m.jobTitle || '—'}</p>
                  {presence && <p className={`truncate text-xs ${presence.online ? 'font-medium text-emerald-600' : 'text-slate-400'}`}>{presence.label}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Badge className={PERMISSION_BADGE[m.permission]}>{TEAM_PERMISSION_LABEL[m.permission]}</Badge>
                    {!m.userId && <Badge className="bg-slate-100 text-slate-500">Sem login</Badge>}
                  </div>
                </div>
              </button>
              )
            })}
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
        </>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle icon={<Briefcase size={13} className="text-white" />} iconBg="bg-slate-400">
          Cargos futuros
        </SectionTitle>
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

      <TeamMeetingsSection
        title={
          <SectionTitle icon={<CalendarClock size={13} className="text-white" />} iconBg="bg-amber-500">
            Reuniões recorrentes da equipe
          </SectionTitle>
        }
      />

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
