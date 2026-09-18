import { Fragment, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CalendarRange, Wand2, LayoutGrid, List, Download, GripVertical } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { useUsers } from '../hooks/useUsers'
import { useOptimizationSchedule } from '../hooks/useOptimizations'
import { setOptimizationSchedule } from '../services/optimizationService'
import { seedOptimizationSchedule } from '../services/optimizationSeed'
import { findUserIdByName } from '../utils/userLookup'
import { trafficServices, platformBadgeLabel } from '../utils/clientServices'
import { OPTIMIZATION_WEEKDAYS, type OptimizationScheduleRow } from '../types/optimization'
import type { Client } from '../types/client'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'

const GESTORES = ['Ciane', 'Nicolas']
const WEEKDAY_COL_LABEL: Record<number, string> = { 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta' }
const WEEKDAY_FULL_LABEL: Record<number, string> = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
}

interface ChipData {
  clientId: string
  companyName: string
  platforms: ('meta' | 'google')[]
}

/** id do chip = 1 ocorrência (cliente + gestor + dia) — o mesmo cliente pode
 *  aparecer em 2 dias pro mesmo gestor (ex.: segunda e quarta), então cada
 *  ocorrência precisa de um id de arraste próprio. */
function chipDragId(clientId: string, gestorId: string, weekday: number) {
  return `${clientId}::${gestorId}::${weekday}`
}
function cellDropId(gestorId: string, weekday: number) {
  return `${gestorId}::${weekday}`
}

function cellBg(count: number): string {
  if (count === 0) return '#F8FAFC'
  if (count <= 4) return '#D1FAE5'
  if (count <= 6) return '#FEF3C7'
  return '#FEE2E2'
}

function Chip({ chip, gestorId, weekday }: { chip: ChipData; gestorId: string; weekday: number }) {
  const id = chipDragId(chip.clientId, gestorId, weekday)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { clientId: chip.clientId, gestorId, weekday },
  })
  const badge = platformBadgeLabel(chip.platforms)

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex cursor-grab items-center gap-1.5 rounded-lg border border-white bg-white px-2 py-1.5 text-xs shadow-sm active:cursor-grabbing ${
        isDragging ? 'opacity-30' : ''
      }`}
    >
      <GripVertical size={11} className="shrink-0 text-slate-300" />
      <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{chip.companyName}</span>
      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}>{badge.label}</span>
    </div>
  )
}

function Cell({
  gestorId,
  weekday,
  chips,
  compact,
}: {
  gestorId: string
  weekday: number
  chips: ChipData[]
  compact?: boolean
}) {
  const id = cellDropId(gestorId, weekday)
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[86px] flex-col gap-1.5 rounded-lg p-2 transition-shadow ${isOver ? 'ring-2 ring-brand-400' : ''}`}
      style={{ backgroundColor: cellBg(chips.length) }}
    >
      {!compact && <p className="px-0.5 text-[11px] font-semibold text-slate-500">{chips.length} cliente{chips.length === 1 ? '' : 's'}</p>}
      <div className="flex flex-col gap-1">
        {chips.map((c) => (
          <Chip key={c.clientId} chip={c} gestorId={gestorId} weekday={weekday} />
        ))}
        {chips.length === 0 && <p className="px-0.5 py-1.5 text-center text-[11px] text-slate-300">Solte aqui</p>}
      </div>
    </div>
  )
}

/** Página de gestão do calendário de otimizações — edita o mesmo
 *  settings/optimizationSchedule que o widget "Otimizações de hoje" do
 *  Dashboard lê, então qualquer mudança aqui reflete lá na hora (mesmo
 *  onSnapshot). Arrastar um chip de cliente entre células muda o dia (e,
 *  se a célula de destino for de outro gestor, também o responsável) —
 *  sem tocar nos outros dias que esse cliente já tenha. */
export function OptimizationCalendarPage() {
  const { profile } = useAuth()
  const { data: clients } = useClients()
  const { data: users } = useUsers()
  const { rows, loading } = useOptimizationSchedule()

  const [gestorFilter, setGestorFilter] = useState<'all' | 'ciane' | 'nicolas'>('all')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set())
  const [seeding, setSeeding] = useState(false)
  const [pendingMove, setPendingMove] = useState<{ row: OptimizationScheduleRow[]; label: string } | null>(null)
  const [balancePreview, setBalancePreview] = useState<{ rows: OptimizationScheduleRow[]; changed: number } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const gestorIds = useMemo(
    () => Object.fromEntries(GESTORES.map((n) => [n, findUserIdByName(users, n)])) as Record<string, string | undefined>,
    [users]
  )
  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])) as Record<string, Client>, [clients])

  const visibleGestores = gestorFilter === 'all' ? GESTORES : GESTORES.filter((n) => n.toLowerCase() === gestorFilter)

  /** chips[gestorId][weekday] — cliente encerrado nunca aparece aqui. */
  const chipsByGestorDay = useMemo(() => {
    const out: Record<string, Record<number, ChipData[]>> = {}
    for (const name of GESTORES) {
      const gid = gestorIds[name]
      out[name] = { 1: [], 2: [], 3: [], 4: [], 5: [] }
      if (!gid) continue
      for (const row of rows) {
        if (row.userId !== gid) continue
        const client = clientById[row.clientId]
        if (!client || client.status === 'churned') continue
        const chip: ChipData = { clientId: client.id, companyName: client.companyName, platforms: trafficServices(client).platforms }
        for (const d of row.weekdays) {
          if (out[name][d]) out[name][d].push(chip)
        }
      }
      for (const d of OPTIMIZATION_WEEKDAYS) out[name][d].sort((a, b) => a.companyName.localeCompare(b.companyName))
    }
    return out
  }, [rows, gestorIds, clientById])

  const summaryByGestor = useMemo(() => {
    return GESTORES.map((name) => {
      const gid = gestorIds[name]
      const clientIds = new Set<string>()
      const perDay: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      if (gid) {
        for (const row of rows) {
          if (row.userId !== gid) continue
          const client = clientById[row.clientId]
          if (!client || client.status === 'churned') continue
          clientIds.add(row.clientId)
          for (const d of row.weekdays) if (perDay[d] != null) perDay[d] += 1
        }
      }
      const entries = OPTIMIZATION_WEEKDAYS.map((d) => ({ day: d, count: perDay[d] }))
      const max = entries.reduce((a, b) => (b.count > a.count ? b : a), entries[0])
      const min = entries.reduce((a, b) => (b.count < a.count ? b : a), entries[0])
      const maxCount = Math.max(1, ...entries.map((e) => e.count))
      return { name, total: clientIds.size, entries, max, min, maxCount }
    })
  }, [rows, gestorIds, clientById])

  const persist = async (newRows: OptimizationScheduleRow[]) => {
    if (!profile) return
    await setOptimizationSchedule(newRows, profile.id)
  }

  /** Move 1 ocorrência (cliente + dia de origem) pra outra célula (gestor +
   *  dia de destino), sem tocar nos outros dias que esse cliente já tenha. */
  const computeMovedRows = (clientId: string, fromWeekday: number, toGestorId: string, toWeekday: number) => {
    const next: OptimizationScheduleRow[] = rows.map((r) => ({ ...r, weekdays: [...r.weekdays] }))
    let row = next.find((r) => r.clientId === clientId)
    if (!row) {
      row = { clientId, userId: toGestorId, weekdays: [] }
      next.push(row)
    }
    row.weekdays = row.weekdays.filter((d) => d !== fromWeekday)
    row.userId = toGestorId
    if (!row.weekdays.includes(toWeekday)) row.weekdays.push(toWeekday)
    row.weekdays.sort((a, b) => a - b)
    return next.filter((r) => r.weekdays.length > 0)
  }

  const persistMove = (newRows: OptimizationScheduleRow[], label: string) => {
    persist(newRows)
      .then(() => toast.success(`✅ ${label}`))
      .catch((err) => {
        console.error(err)
        toast.error('Erro ao mover o cliente')
      })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const data = active.data.current as { clientId: string; gestorId: string; weekday: number } | undefined
    if (!data) return
    const [toGestorId, toWeekdayStr] = String(over.id).split('::')
    const toWeekday = Number(toWeekdayStr)
    if (data.gestorId === toGestorId && data.weekday === toWeekday) return

    const destGestorName = GESTORES.find((n) => gestorIds[n] === toGestorId)
    const currentDestCount = destGestorName ? chipsByGestorDay[destGestorName][toWeekday].length : 0
    const alreadyThere = destGestorName ? chipsByGestorDay[destGestorName][toWeekday].some((c) => c.clientId === data.clientId) : false
    const projectedCount = currentDestCount + (alreadyThere ? 0 : 1)

    const client = clientById[data.clientId]
    const newRows = computeMovedRows(data.clientId, data.weekday, toGestorId, toWeekday)
    const label = `${client?.companyName ?? 'Cliente'} movido para ${WEEKDAY_COL_LABEL[toWeekday]}`

    if (projectedCount >= 7) {
      setPendingMove({ row: newRows, label })
      return
    }
    persistMove(newRows, label)
  }

  const confirmPendingMove = () => {
    if (!pendingMove) return
    const { row, label } = pendingMove
    setPendingMove(null)
    persistMove(row, label)
  }

  const handleSeed = async () => {
    if (!profile) return
    setSeeding(true)
    try {
      const res = await seedOptimizationSchedule(clients, users, profile.id)
      if (!res.seeded) toast('O calendário já está cadastrado.')
      else toast.success(`Calendário importado — ${res.rows} clientes.`)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao importar o calendário')
    } finally {
      setSeeding(false)
    }
  }

  const handleAutoBalancePreview = () => {
    const next: OptimizationScheduleRow[] = rows.map((r) => ({ ...r, weekdays: [...r.weekdays] }))
    let changed = 0

    for (const name of visibleGestores) {
      const gid = gestorIds[name]
      if (!gid) continue
      const clientIds = [...new Set(rows.filter((r) => r.userId === gid).map((r) => r.clientId))]
        .filter((id) => clientById[id] && clientById[id].status !== 'churned')
        .sort((a, b) => clientById[a].companyName.localeCompare(clientById[b].companyName))

      clientIds.forEach((clientId, i) => {
        const targetDay = OPTIMIZATION_WEEKDAYS[i % OPTIMIZATION_WEEKDAYS.length]
        const row = next.find((r) => r.clientId === clientId)
        const currentDays = row?.weekdays ?? []
        const isSame = currentDays.length === 1 && currentDays[0] === targetDay
        if (!isSame) changed += 1
        if (row) {
          row.weekdays = [targetDay]
          row.userId = gid
        } else {
          next.push({ clientId, userId: gid, weekdays: [targetDay] })
        }
      })
    }

    if (changed === 0) {
      toast('Já está balanceado.')
      return
    }
    setBalancePreview({ rows: next.filter((r) => r.weekdays.length > 0), changed })
  }

  const confirmAutoBalance = () => {
    if (!balancePreview) return
    const { rows: newRows, changed } = balancePreview
    setBalancePreview(null)
    persist(newRows)
      .then(() => toast.success(`✅ Calendário balanceado — ${changed} cliente${changed === 1 ? '' : 's'} movido${changed === 1 ? '' : 's'}`))
      .catch((err) => {
        console.error(err)
        toast.error('Erro ao balancear o calendário')
      })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[28px] font-extrabold leading-tight text-slate-900">
            <CalendarRange size={26} className="text-brand-600" /> Calendário de Otimizações
          </h1>
          <p className="text-[15px] text-[#64748B]">Organize e balanceie as otimizações da equipe por dia da semana</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" icon={<Wand2 size={14} />} onClick={handleAutoBalancePreview}>
            Auto-balancear
          </Button>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setView('grid')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                view === 'grid' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              <LayoutGrid size={14} /> Grade
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                view === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              <List size={14} /> Lista
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(['all', 'ciane', 'nicolas'] as const).map((g) => (
          <button
            key={g}
            onClick={() => setGestorFilter(g)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              gestorFilter === g ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {g === 'all' ? 'Todos' : g === 'ciane' ? 'Ciane' : 'Nicolas'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-slate-100 bg-white p-6">
          <p className="text-sm text-slate-500">Nenhum calendário cadastrado ainda.</p>
          <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={handleSeed} loading={seeding}>
            Importar calendário padrão
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          {view === 'grid' ? (
            <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white p-3">
              <div className="grid min-w-[720px] gap-2" style={{ gridTemplateColumns: '110px repeat(5, 1fr)' }}>
                <div />
                {OPTIMIZATION_WEEKDAYS.map((d) => (
                  <p key={d} className="px-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {WEEKDAY_COL_LABEL[d]}
                  </p>
                ))}
                {visibleGestores.map((name) => (
                  <Fragment key={name}>
                    <div className="flex items-center text-sm font-semibold text-slate-700">{name}</div>
                    {OPTIMIZATION_WEEKDAYS.map((d) => (
                      <Cell key={`${name}-${d}`} gestorId={gestorIds[name] ?? ''} weekday={d} chips={chipsByGestorDay[name]?.[d] ?? []} />
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {OPTIMIZATION_WEEKDAYS.map((d) => {
                const isCollapsed = collapsedDays.has(d)
                return (
                  <div key={d} className="overflow-hidden rounded-xl border border-slate-100 bg-white">
                    <button
                      onClick={() =>
                        setCollapsedDays((prev) => {
                          const next = new Set(prev)
                          if (next.has(d)) next.delete(d)
                          else next.add(d)
                          return next
                        })
                      }
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-50"
                    >
                      {WEEKDAY_FULL_LABEL[d]}
                      <span className="text-xs text-slate-400">{isCollapsed ? '▶' : '▼'}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-3 sm:grid-cols-2">
                        {visibleGestores.map((name) => {
                          const chips = chipsByGestorDay[name]?.[d] ?? []
                          return (
                            <div key={name}>
                              <p className="mb-1.5 text-xs font-semibold text-slate-500">
                                ▼ {name} ({chips.length} cliente{chips.length === 1 ? '' : 's'})
                              </p>
                              <Cell gestorId={gestorIds[name] ?? ''} weekday={d} chips={chips} compact />
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </DndContext>
      )}

      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {summaryByGestor
            .filter((s) => visibleGestores.includes(s.name))
            .map((s) => (
              <div key={s.name} className="rounded-xl border border-slate-100 bg-white p-4">
                <p className="mb-2 text-sm font-semibold text-slate-800">{s.name}</p>
                <p className="text-xs text-slate-500">Total de clientes: <span className="font-semibold text-slate-700">{s.total}</span></p>
                <p className="text-xs text-slate-500">
                  Dia mais cheio: <span className="font-semibold text-slate-700">{WEEKDAY_COL_LABEL[s.max.day]} ({s.max.count})</span>
                </p>
                <p className="text-xs text-slate-500">
                  Dia mais vazio: <span className="font-semibold text-slate-700">{WEEKDAY_COL_LABEL[s.min.day]} ({s.min.count})</span>
                </p>
                <div className="mt-2.5 flex flex-col gap-1">
                  {s.entries.map((e) => (
                    <div key={e.day} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-[11px] text-slate-400">{WEEKDAY_COL_LABEL[e.day]}</span>
                      <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${(e.count / s.maxCount) * 100}%` }}
                        />
                      </div>
                      <span className="w-4 shrink-0 text-right text-[11px] text-slate-400">{e.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}

      <Modal open={!!pendingMove} onClose={() => setPendingMove(null)} title="⚠️ Dia sobrecarregado">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">Esse dia já tem muitos clientes. Deseja continuar mesmo assim?</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPendingMove(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmPendingMove}>Mover mesmo assim</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!balancePreview} onClose={() => setBalancePreview(null)} title="Auto-balancear calendário">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            Isso vai mover {balancePreview?.changed} cliente{balancePreview?.changed === 1 ? '' : 's'} para equilibrar a
            carga por dia (cada cliente passa a ter um único dia fixo de otimização). Confirmar?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBalancePreview(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmAutoBalance}>Confirmar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
