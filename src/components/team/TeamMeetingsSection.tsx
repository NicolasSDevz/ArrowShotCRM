import { Fragment, useEffect, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { Timestamp } from 'firebase/firestore'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarClock, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Input } from '../ui/Field'
import { Button } from '../ui/Button'
import { subscribeTeamMeetings, saveTeamMeetings, type TeamMeetingItem } from '../../services/teamMeetingsService'

type Draft = Pick<TeamMeetingItem, 'title' | 'schedule' | 'participants'>
const EMPTY: Draft = { title: '', schedule: '', participants: '' }

/** "Reuniões recorrentes da equipe" — lista editável por qualquer interno:
 *  adicionar, editar, excluir e marcar como feita (mostra quando e por quem). */
export function TeamMeetingsSection({ title }: { title: ReactNode }) {
  const { profile } = useAuth()
  const [meetings, setMeetings] = useState<TeamMeetingItem[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY)

  useEffect(() => subscribeTeamMeetings(setMeetings), [])

  const persist = async (next: TeamMeetingItem[], ok?: string) => {
    if (!profile) return
    const prev = meetings
    setMeetings(next)
    try {
      await saveTeamMeetings(next, profile.id)
      if (ok) toast.success(ok)
    } catch (err) {
      console.error(err)
      setMeetings(prev)
      toast.error('Erro ao salvar as reuniões')
    }
  }

  const startEdit = (m?: TeamMeetingItem) => {
    setEditingId(m ? m.id : 'new')
    setDraft(m ? { title: m.title, schedule: m.schedule, participants: m.participants } : EMPTY)
  }

  const saveDraft = () => {
    if (!draft.title.trim()) return toast.error('Dê um nome à reunião')
    const clean = { title: draft.title.trim(), schedule: draft.schedule.trim(), participants: draft.participants.trim() }
    const next = editingId === 'new' ? [...meetings, { id: crypto.randomUUID(), ...clean }] : meetings.map((m) => (m.id === editingId ? { ...m, ...clean } : m))
    setEditingId(null)
    void persist(next, editingId === 'new' ? 'Reunião adicionada' : 'Reunião atualizada')
  }

  const remove = (m: TeamMeetingItem) => {
    if (!confirm(`Excluir a reunião "${m.title}"?`)) return
    void persist(meetings.filter((x) => x.id !== m.id), 'Reunião excluída')
  }

  const toggleDone = (m: TeamMeetingItem) => {
    const done = !!m.lastDoneAt
    void persist(
      meetings.map((x) => (x.id === m.id ? { ...x, lastDoneAt: done ? null : Timestamp.now(), lastDoneBy: done ? null : (profile?.name ?? null) } : x)),
      done ? undefined : 'Reunião marcada como feita'
    )
  }

  const editRow = (
    <tr className="border-b border-slate-50 bg-brand-50/40">
      <td className="px-3 py-2">
        <Input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Nome da reunião" />
      </td>
      <td className="px-3 py-2">
        <Input value={draft.schedule} onChange={(e) => setDraft({ ...draft, schedule: e.target.value })} placeholder="Ex: Toda sexta, 09:15" />
      </td>
      <td className="px-3 py-2">
        <Input value={draft.participants} onChange={(e) => setDraft({ ...draft, participants: e.target.value })} placeholder="Ex: Toda a equipe" />
      </td>
      <td className="px-3 py-2" />
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          <button onClick={saveDraft} title="Salvar" className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50">
            <Check size={15} />
          </button>
          <button onClick={() => setEditingId(null)} title="Cancelar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={15} />
          </button>
        </div>
      </td>
    </tr>
  )

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        {title}
        <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={() => startEdit()} disabled={editingId !== null}>
          Nova reunião
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[15px]">
            <thead className="border-b border-slate-100 bg-slate-50 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Reunião</th>
                <th className="px-4 py-2.5 font-semibold">Quando</th>
                <th className="px-4 py-2.5 font-semibold">Participantes</th>
                <th className="px-4 py-2.5 font-semibold">Última feita</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) =>
                editingId === m.id ? (
                  <Fragment key={m.id}>{editRow}</Fragment>
                ) : (
                  <tr key={m.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{m.title}</td>
                    <td className="px-4 py-2.5 text-slate-600">{m.schedule || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{m.participants || '—'}</td>
                    <td className="px-4 py-2.5">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={!!m.lastDoneAt}
                          onChange={() => toggleDone(m)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
                        />
                        {m.lastDoneAt ? (
                          <span className="text-xs text-emerald-700">
                            {format(m.lastDoneAt.toDate(), "dd/MM 'às' HH:mm", { locale: ptBR })}
                            {m.lastDoneBy ? ` · ${m.lastDoneBy}` : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Marcar como feita</span>
                        )}
                      </label>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => startEdit(m)} disabled={editingId !== null} title="Editar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => remove(m)} disabled={editingId !== null} title="Excluir" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
              {editingId === 'new' && editRow}
              {meetings.length === 0 && editingId !== 'new' && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400">
                    <CalendarClock size={16} className="mx-auto mb-1" />
                    Nenhuma reunião cadastrada. Clique em "Nova reunião".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
