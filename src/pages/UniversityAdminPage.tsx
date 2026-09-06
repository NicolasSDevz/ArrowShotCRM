import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, ChevronDown, ChevronRight, Download, Mail, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useUsers } from '../hooks/useUsers'
import { useTrails } from '../hooks/useTrails'
import { useAllModules } from '../hooks/useModules'
import { useAllProgress } from '../hooks/useProgress'
import { useInvites } from '../hooks/useInvites'
import { deleteTrail } from '../services/trailService'
import { deleteModule } from '../services/moduleService'
import { seedInitialTrails } from '../services/universitySeed'
import { createInvite, deleteInvite, markInviteDone } from '../services/inviteService'
import { TrailFormModal } from '../components/university/TrailFormModal'
import { ModuleFormModal } from '../components/university/ModuleFormModal'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { Badge } from '../components/ui/Badge'
import { Avatar } from '../components/ui/Avatar'
import { Spinner } from '../components/ui/FullPageSpinner'
import { EmptyState } from '../components/ui/EmptyState'
import type { AppUser, Module, Trail } from '../types'

/** `name` falls back to the raw e-mail when Firebase Auth has no displayName
 *  (see AuthContext) — reformat that case into a readable display name.
 *  TODO: o ideal é ter um campo "nome" preenchido no cadastro do funcionário,
 *  em vez de depender desse fallback. */
function displayNameFor(user: AppUser) {
  if (!user.name.includes('@')) return user.name

  return user.email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

export function UniversityAdminPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const { data: trails, loading: loadingTrails } = useTrails()
  const { data: modules } = useAllModules()
  const { data: progress } = useAllProgress()
  const { data: invites } = useInvites()

  const [expandedTrailId, setExpandedTrailId] = useState<string | null>(null)
  const [editingTrail, setEditingTrail] = useState<Trail | null>(null)
  const [creatingTrail, setCreatingTrail] = useState(false)
  const [editingModule, setEditingModule] = useState<{ trailId: string; module: Module | null } | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')

  const internalUsers = users.filter((u) => u.role !== 'client')

  const handleSeed = async () => {
    if (!profile) return
    setSeeding(true)
    try {
      const result = await seedInitialTrails(profile.id)
      toast.success(result.seeded ? 'Trilhas iniciais importadas' : 'Já existem trilhas cadastradas')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao importar trilhas iniciais')
    } finally {
      setSeeding(false)
    }
  }

  const handleDeleteTrail = async (trail: Trail) => {
    if (!confirm(`Excluir a trilha "${trail.title}" e todos os seus módulos?`)) return
    try {
      const trailModules = modules.filter((m) => m.trailId === trail.id)
      await Promise.all(trailModules.map((m) => deleteModule(m.id)))
      await deleteTrail(trail.id)
      toast.success('Trilha excluída')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao excluir a trilha')
    }
  }

  const handleDeleteModule = async (module: Module) => {
    if (!confirm(`Excluir o módulo "${module.title}"?`)) return
    try {
      await deleteModule(module.id)
      toast.success('Módulo excluído')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao excluir o módulo')
    }
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !profile) return
    try {
      await createInvite(inviteEmail.trim(), profile.id)
      toast.success('Convite registrado')
      setInviteEmail('')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao registrar convite')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => navigate('/universidade')}
        className="flex w-fit items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={14} /> Universidade
      </button>

      <div>
        <h1 className="text-[28px] font-extrabold text-slate-900">Painel Admin — Universidade Arrow Shot</h1>
        <p className="text-[15px] text-[#64748B]">Gerencie trilhas, módulos, progresso e convites.</p>
      </div>

      {/* ---------- Trilhas e módulos ---------- */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Trilhas</h2>
          <div className="flex gap-2">
            {trails.length === 0 && (
              <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={handleSeed} loading={seeding}>
                Importar trilhas iniciais
              </Button>
            )}
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreatingTrail(true)}>
              Nova trilha
            </Button>
          </div>
        </div>

        {loadingTrails ? (
          <Spinner />
        ) : trails.length === 0 ? (
          <EmptyState title="Nenhuma trilha cadastrada" />
        ) : (
          <div className="flex flex-col gap-2">
            {trails.map((trail) => {
              const trailModules = modules.filter((m) => m.trailId === trail.id)
              const expanded = expandedTrailId === trail.id
              return (
                <div key={trail.id} className="rounded-xl border border-slate-100 bg-white">
                  <div className="flex items-center gap-2 px-4 py-3">
                    <button
                      onClick={() => setExpandedTrailId(expanded ? null : trail.id)}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <span className="font-medium text-slate-800">{trail.title}</span>
                      <span className="text-xs text-slate-400">{trailModules.length} módulo(s)</span>
                    </button>
                    <button onClick={() => setEditingTrail(trail)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDeleteTrail(trail)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {expanded && (
                    <div className="flex flex-col gap-1.5 border-t border-slate-100 px-4 py-3">
                      {trailModules.map((m) => (
                        <div key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                          <span className="flex-1 truncate text-slate-700">{m.title}</span>
                          <button onClick={() => setEditingModule({ trailId: trail.id, module: m })} className="rounded p-1 text-slate-400 hover:text-slate-600">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDeleteModule(m)} className="rounded p-1 text-slate-400 hover:text-red-500">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Plus size={13} />}
                        className="mt-1 w-fit"
                        onClick={() => setEditingModule({ trailId: trail.id, module: null })}
                      >
                        Novo módulo
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ---------- Progresso por funcionário ---------- */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Progresso por funcionário</h2>
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-[15px]">
              <thead className="border-b border-slate-100 bg-slate-50 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Pessoa</th>
                  <th className="px-4 py-2.5 font-semibold">Módulos concluídos</th>
                  <th className="px-4 py-2.5 font-semibold">Nota média</th>
                </tr>
              </thead>
              <tbody>
                {internalUsers.map((u) => {
                  const userProgress = progress.filter((p) => p.userId === u.id && p.completed)
                  const avgScore =
                    userProgress.length > 0
                      ? Math.round(userProgress.reduce((sum, p) => sum + p.quizScore, 0) / userProgress.length)
                      : null
                  const displayName = displayNameFor(u)
                  return (
                    <tr key={u.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={displayName} photoURL={u.photoURL} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-700">{displayName}</p>
                            <p className="truncate text-xs text-slate-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {userProgress.length}/{modules.length}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{avgScore !== null ? `${avgScore}%` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ---------- Convidar funcionários ---------- */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">Convidar novos funcionários</h2>
        <p className="text-xs text-slate-400">
          Registra o convite aqui; a conta em si ainda precisa ser criada manualmente no Firebase Console
          (Authentication → Users), como já é o processo do CRM hoje.
        </p>
        <div className="flex max-w-sm gap-2">
          <Input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="email@arrowshot.com"
            onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
          />
          <Button icon={<Mail size={14} />} onClick={handleInvite} disabled={!inviteEmail.trim()}>
            Convidar
          </Button>
        </div>

        {invites.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm">
                <span className="flex-1 truncate text-slate-700">{inv.email}</span>
                <Badge className={inv.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}>
                  {inv.status === 'pending' ? 'Pendente' : 'Concluído'}
                </Badge>
                {inv.status === 'pending' && profile && (
                  <button
                    onClick={() => markInviteDone(inv.id, profile.id)}
                    className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                  >
                    Marcar concluído
                  </button>
                )}
                <button onClick={() => deleteInvite(inv.id)} className="rounded p-1 text-slate-300 hover:text-red-500">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <TrailFormModal open={creatingTrail} onClose={() => setCreatingTrail(false)} nextOrder={trails.length} />
      <TrailFormModal open={!!editingTrail} onClose={() => setEditingTrail(null)} trail={editingTrail} />
      {editingModule && (
        <ModuleFormModal
          open={!!editingModule}
          onClose={() => setEditingModule(null)}
          trailId={editingModule.trailId}
          module={editingModule.module}
          nextOrder={modules.filter((m) => m.trailId === editingModule.trailId).length}
        />
      )}
    </div>
  )
}
