import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, CalendarCog, Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAssigneeMap } from '../../hooks/useAssignees'
import { useClientOptimizations, useOptimizationSchedule } from '../../hooks/useOptimizations'
import { deleteOptimization, setClientOptimizationRow } from '../../services/optimizationService'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Spinner } from '../ui/FullPageSpinner'
import { OptimizationFormModal } from './OptimizationFormModal'
import { OptimizationBalanceChart } from './OptimizationBalanceChart'
import {
  OPTIMIZATION_PLATFORM_LABEL,
  OPTIMIZATION_WEEKDAYS,
  WEEKDAY_LABEL_SHORT,
  weekdaysLabel,
  type Client,
  type Optimization,
} from '../../types'

const fmtBRL = (v?: number) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function ClientOptimizationsTab({ client }: { client: Client }) {
  const { profile } = useAuth()
  const assigneeMap = useAssigneeMap()
  const { data: optimizations, loading } = useClientOptimizations(client.id)
  const { rows, loading: scheduleLoading } = useOptimizationSchedule()

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Optimization | null>(null)
  const [editingDays, setEditingDays] = useState(false)
  const [draftDays, setDraftDays] = useState<number[]>([])
  const [savingDays, setSavingDays] = useState(false)

  const scheduleRow = useMemo(() => rows.find((r) => r.clientId === client.id), [rows, client.id])
  const days = scheduleRow?.weekdays ?? []

  const sorted = useMemo(
    () => [...optimizations].sort((a, b) => b.date.toMillis() - a.date.toMillis()),
    [optimizations]
  )

  const openDaysEditor = () => {
    setDraftDays(days)
    setEditingDays(true)
  }

  const toggleDraftDay = (d: number) =>
    setDraftDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)))

  const saveDays = async () => {
    if (!profile) return
    setSavingDays(true)
    try {
      await setClientOptimizationRow(
        rows,
        { clientId: client.id, userId: scheduleRow?.userId ?? profile.id, weekdays: draftDays },
        profile.id
      )
      toast.success('Dias de otimização atualizados')
      setEditingDays(false)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar os dias')
    } finally {
      setSavingDays(false)
    }
  }

  const handleDelete = async (o: Optimization) => {
    if (!confirm('Excluir este registro de otimização?')) return
    try {
      await deleteOptimization(o.id)
      toast.success('Registro excluído')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao excluir')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Otimizações de Campanhas</h3>
          <p className="text-sm text-slate-400">Registro de todas as otimizações realizadas</p>
        </div>
        <Button size="sm" icon={<Plus size={13} />} onClick={() => setCreating(true)}>
          Registrar otimização
        </Button>
      </div>

      {/* dias de otimização */}
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
        {scheduleLoading ? (
          <p className="text-xs text-slate-400">Carregando calendário…</p>
        ) : editingDays ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-slate-500">Dias em que este cliente é otimizado</p>
            <div className="flex flex-wrap gap-1.5">
              {OPTIMIZATION_WEEKDAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDraftDay(d)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    draftDays.includes(d)
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:bg-white'
                  }`}
                >
                  {WEEKDAY_LABEL_SHORT[d]}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditingDays(false)}>Cancelar</Button>
              <Button size="sm" onClick={saveDays} loading={savingDays}>Salvar</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <CalendarCog size={15} className="shrink-0 text-slate-400" />
            <p className="text-sm text-slate-600">
              {days.length > 0
                ? `Este cliente é otimizado às ${weekdaysLabel(days)}.`
                : 'Nenhum dia de otimização configurado para este cliente.'}
            </p>
            <button onClick={openDaysEditor} className="text-xs font-medium text-brand-600 hover:text-brand-700">
              Editar
            </button>
          </div>
        )}
      </div>

      {/* lista */}
      {loading ? (
        <Spinner />
      ) : sorted.length === 0 ? (
        <EmptyState title="Nenhuma otimização registrada ainda" />
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((o) => {
            const who = assigneeMap[o.responsavelId]
            return (
              <div key={o.id} className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">
                      {format(o.date.toDate(), 'dd/MM/yyyy', { locale: ptBR })}
                    </span>
                    {o.platforms.map((p) => (
                      <Badge key={p} className="bg-slate-100 text-slate-500">{OPTIMIZATION_PLATFORM_LABEL[p]}</Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(o)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Editar">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(o)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label="Excluir">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{o.optimizationsText}</p>
                {o.notes && <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-500">Obs.: {o.notes}</p>}

                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Avatar name={who?.name ?? o.responsavelName} photoURL={who?.photoURL} size="xs" /> {who?.name ?? o.responsavelName}
                  </span>
                  {o.metaBalance != null && <span>Saldo Meta: <span className="font-medium text-slate-700">{fmtBRL(o.metaBalance)}</span></span>}
                  {o.googleBalance != null && <span>Saldo Google: <span className="font-medium text-slate-700">{fmtBRL(o.googleBalance)}</span></span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* histórico de saldo */}
      {sorted.some((o) => o.metaBalance != null || o.googleBalance != null) && (
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <Check size={13} /> Evolução do saldo (últimas 8 semanas)
          </p>
          <OptimizationBalanceChart optimizations={sorted} />
        </div>
      )}

      <OptimizationFormModal open={creating} onClose={() => setCreating(false)} clientId={client.id} />
      <OptimizationFormModal
        key={editing?.id ?? 'none'}
        open={!!editing}
        onClose={() => setEditing(null)}
        clientId={client.id}
        optimization={editing}
      />
    </div>
  )
}
