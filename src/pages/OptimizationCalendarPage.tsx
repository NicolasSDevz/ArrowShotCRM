import { Fragment, createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
import {
  CalendarRange,
  Wand2,
  LayoutGrid,
  List,
  Download,
  GripVertical,
  AlertTriangle,
  Search,
  X,
  ChevronDown,
  CheckCircle2,
  Info,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useClients } from '../hooks/useClients'
import { useUsers } from '../hooks/useUsers'
import { useOptimizationSchedule } from '../hooks/useOptimizations'
import { setOptimizationSchedule } from '../services/optimizationService'
import { seedOptimizationSchedule } from '../services/optimizationSeed'
import { findUserIdByName } from '../utils/userLookup'
import { trafficServices, hasContractedPaidTraffic, PLATFORM_BADGE } from '../utils/clientServices'
import { OPTIMIZATION_WEEKDAYS, type OptimizationScheduleRow } from '../types/optimization'
import { getClientOwnerIds, isClientInOperation, type Client } from '../types/client'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Avatar } from '../components/ui/Avatar'
import { Spinner } from '../components/ui/FullPageSpinner'

const GESTORES = ['Ciane', 'Nicolas']
/** Combinações de 2 dias não-consecutivos preferidas pro auto-balancear —
 *  evita Segunda+Terça, Terça+Quarta etc. (dias colados = muito tempo sem
 *  otimizar entre uma passagem e outra). */
const PREFERRED_PAIRS: [number, number][] = [
  [1, 3],
  [1, 4],
  [2, 4],
  [2, 5],
  [3, 5],
]
const WEEKDAY_COL_LABEL: Record<number, string> = { 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta' }
const WEEKDAY_SHORT_LABEL: Record<number, string> = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex' }
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
  /** Quantos dias esse cliente já tem no total (0, 1 ou 2) — define o
   *  visual do chip (completo/incompleto/sem dia), igual em qualquer célula
   *  ou na área "Sem dia definido" em que ele apareça. */
  daysCount: number
}

/** id do chip = 1 ocorrência (cliente + gestor + dia, ou "bank" quando vem
 *  da área "Sem dia definido") — o mesmo cliente pode aparecer em 2 dias
 *  pro mesmo gestor (ex.: segunda e quarta) mais a área "sem dia" quando
 *  incompleto, então cada ocorrência precisa de um id de arraste próprio. */
function chipDragId(clientId: string, gestorId: string, weekday: number | 'bank') {
  return `${clientId}::${gestorId}::${weekday}`
}
function cellDropId(gestorId: string, weekday: number) {
  return `${gestorId}::${weekday}`
}

// Cada cliente aparece 2x por semana — os limiares de carga por célula
// consideram isso. As cores de cada faixa ficam em index.css
// (.opt-load[data-load]).
type Load = 'empty' | 'low' | 'mid' | 'high'
function cellLoad(count: number): Load {
  if (count === 0) return 'empty'
  if (count <= 5) return 'low'
  if (count <= 8) return 'mid'
  return 'high'
}
const LOAD_LABEL: Record<Load, string> = { empty: 'Livre', low: 'Leve', mid: 'Médio', high: 'Cheio' }

/** Estado do chip pela completude (não onde ele está renderizado): 2 dias =
 *  completo (azul), 1 dia = falta o segundo (âmbar), 0 dias = tracejado (só
 *  existe na área "Sem dia definido"). Cores em index.css (.opt-chip[data-chip]). */
function chipState(daysCount: number): 'full' | 'half' | 'none' {
  if (daysCount >= 2) return 'full'
  if (daysCount === 1) return 'half'
  return 'none'
}

/** Busca sem acento e sem diferenciar maiúscula. */
function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Dia da semana de hoje (1 = segunda … 5 = sexta); fim de semana = null. */
function todayWeekday(): number | null {
  const d = new Date().getDay()
  return d >= 1 && d <= 5 ? d : null
}

/** Busca e "abrir edição" chegam em qualquer chip sem passar prop por prop. */
const CalendarCtx = createContext<{ query: string; openEdit: (clientId: string, gestorId: string) => void }>({
  query: '',
  openEdit: () => {},
})

function PlatformTags({ platforms }: { platforms: ('meta' | 'google')[] }) {
  const list: ('meta' | 'google')[] = platforms.length ? platforms : ['meta']
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {list.includes('meta') && (
        <span title="Meta Ads" className={`rounded px-1 py-px text-[9px] font-bold leading-none ${PLATFORM_BADGE.meta}`}>
          M
        </span>
      )}
      {list.includes('google') && (
        <span title="Google Ads" className={`rounded px-1 py-px text-[9px] font-bold leading-none ${PLATFORM_BADGE.google}`}>
          G
        </span>
      )}
    </span>
  )
}

function Chip({
  chip,
  gestorId,
  weekday,
  onRemove,
}: {
  chip: ChipData
  gestorId: string
  weekday: number | 'bank'
  /** Só passado pelas células da grade — a área "Sem dia definido" não tem
   *  um dia específico pra remover. */
  onRemove?: () => void
}) {
  const { query, openEdit } = useContext(CalendarCtx)
  const id = chipDragId(chip.clientId, gestorId, weekday)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { clientId: chip.clientId, gestorId, weekday },
  })
  const q = normalize(query)
  const match = !q || normalize(chip.companyName).includes(q)

  return (
    <div
      ref={setNodeRef}
      data-chip={chipState(chip.daysCount)}
      className={`opt-chip group flex items-center gap-1 rounded-md py-1 pl-0.5 pr-1 text-xs transition-opacity ${
        isDragging ? 'opacity-30' : !match ? 'opacity-20' : ''
      } ${q && match ? 'ring-2 ring-brand-400' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label={`Arrastar ${chip.companyName}`}
        className="flex shrink-0 cursor-grab items-center rounded p-0.5 text-slate-300 hover:text-slate-500 active:cursor-grabbing"
      >
        <GripVertical size={12} />
      </button>
      <button
        type="button"
        onClick={() => openEdit(chip.clientId, gestorId)}
        title="Clique para escolher os dias"
        className="min-w-0 flex-1 truncate text-left font-medium text-slate-700 hover:text-brand-600"
      >
        {chip.companyName}
      </button>
      {chip.daysCount === 1 && (
        <span
          title="Só tem 1 dia — falta o segundo"
          className="shrink-0 rounded bg-amber-100 px-1 py-px text-[9px] font-bold leading-none text-amber-700"
        >
          1/2
        </span>
      )}
      <PlatformTags platforms={chip.platforms} />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Tirar este dia"
          aria-label={`Tirar ${chip.companyName} deste dia`}
          className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500 focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

function Cell({
  gestorId,
  weekday,
  chips,
  compact,
  isToday,
  onRemoveChip,
}: {
  gestorId: string
  weekday: number
  chips: ChipData[]
  compact?: boolean
  isToday?: boolean
  onRemoveChip: (clientId: string, weekday: number) => void
}) {
  const id = cellDropId(gestorId, weekday)
  const { setNodeRef, isOver } = useDroppable({ id })
  const load = cellLoad(chips.length)

  return (
    <div
      ref={setNodeRef}
      data-today={isToday ? '1' : undefined}
      className={`opt-cell flex min-h-[110px] flex-col rounded-lg transition-shadow ${isOver ? 'ring-2 ring-brand-400' : ''}`}
    >
      {!compact && (
        <div className="flex items-center justify-between gap-1 px-2 pt-1.5">
          <span className="text-[11px] font-semibold tabular-nums text-slate-500">
            {chips.length} cliente{chips.length === 1 ? '' : 's'}
          </span>
          <span data-load={load} className="opt-load rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">
            {LOAD_LABEL[load]}
          </span>
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1 p-1.5">
        {chips.map((c) => (
          <Chip key={c.clientId} chip={c} gestorId={gestorId} weekday={weekday} onRemove={() => onRemoveChip(c.clientId, weekday)} />
        ))}
        {chips.length === 0 && (
          <div className="flex min-h-[44px] flex-1 items-center justify-center rounded-md border border-dashed border-slate-200 text-[11px] text-slate-400">
            Solte aqui
          </div>
        )}
      </div>
    </div>
  )
}

/** Só é renderizada quando há pelo menos 1 cliente sem os 2 dias — some
 *  assim que todo mundo fica completo. */
function BankArea({ name, gestorId, chips }: { name: string; gestorId: string; chips: ChipData[] }) {
  const total = chips.length
  return (
    <div className="opt-bank rounded-xl p-3">
      <div className="mb-1 flex items-center gap-2">
        <AlertTriangle size={15} className="shrink-0 text-amber-500" />
        <p className="text-sm font-semibold text-slate-700">Faltando dia · {name}</p>
        <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-700">{total}</span>
      </div>
      <p className="mb-2.5 text-xs text-slate-400">Arraste para um dia da grade ou clique no nome para escolher os dias.</p>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {chips.map((c) => (
          <Chip key={c.clientId} chip={c} gestorId={gestorId} weekday="bank" />
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'warn' }) {
  return (
    <div className="min-w-0">
      <p className={`text-lg font-bold tabular-nums leading-tight ${tone === 'warn' ? 'text-amber-600' : 'text-slate-800'}`}>{value}</p>
      <p className="truncate text-[11px] text-slate-400">{label}</p>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string; icon?: ReactNode }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors ${
            value === o.value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
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
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<{ clientId: string; gestorId: string; weekdays: number[] } | null>(null)

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
        if (!client || !isClientInOperation(client) || !hasContractedPaidTraffic(client)) continue
        const chip: ChipData = {
          clientId: client.id,
          companyName: client.companyName,
          platforms: trafficServices(client).platforms,
          daysCount: row.weekdays.length,
        }
        for (const d of row.weekdays) {
          if (out[name][d]) out[name][d].push(chip)
        }
      }
      for (const d of OPTIMIZATION_WEEKDAYS) out[name][d].sort((a, b) => a.companyName.localeCompare(b.companyName))
    }
    return out
  }, [rows, gestorIds, clientById])

  /** Clientes sem os 2 dias completos — sem nenhuma linha, linha com 0 dias
   *  (removidos de tudo), ou com só 1 dia (falta o segundo). O "gestor dono"
   *  vem da linha do calendário quando existe; sem linha, cai pro
   *  responsável cadastrado no próprio cliente (cliente novo, nunca tocado
   *  no calendário). */
  const bankByGestor = useMemo(() => {
    const out: Record<string, ChipData[]> = {}
    for (const name of GESTORES) out[name] = []
    for (const client of clients) {
      if (!isClientInOperation(client) || !hasContractedPaidTraffic(client)) continue
      const svc = trafficServices(client)
      const row = rows.find((r) => r.clientId === client.id)
      const daysCount = row?.weekdays.length ?? 0
      if (daysCount >= 2) continue
      const owners = row ? [row.userId] : getClientOwnerIds(client)
      for (const name of GESTORES) {
        const gid = gestorIds[name]
        if (gid && owners.includes(gid)) {
          out[name].push({ clientId: client.id, companyName: client.companyName, platforms: svc.platforms, daysCount })
        }
      }
    }
    for (const name of GESTORES) out[name].sort((a, b) => a.companyName.localeCompare(b.companyName))
    return out
  }, [clients, rows, gestorIds])

  const summaryByGestor = useMemo(() => {
    return GESTORES.map((name) => {
      const gid = gestorIds[name]
      const clientIds = new Set<string>()
      const perDay: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      if (gid) {
        for (const row of rows) {
          if (row.userId !== gid) continue
          const client = clientById[row.clientId]
          if (!client || !isClientInOperation(client) || !hasContractedPaidTraffic(client)) continue
          clientIds.add(row.clientId)
          for (const d of row.weekdays) if (perDay[d] != null) perDay[d] += 1
        }
        for (const c of bankByGestor[name] ?? []) clientIds.add(c.clientId)
      }
      const entries = OPTIMIZATION_WEEKDAYS.map((d) => ({ day: d, count: perDay[d] }))
      const max = entries.reduce((a, b) => (b.count > a.count ? b : a), entries[0])
      const min = entries.reduce((a, b) => (b.count < a.count ? b : a), entries[0])
      const maxCount = Math.max(1, ...entries.map((e) => e.count))
      return { name, total: clientIds.size, entries, max, min, maxCount }
    })
  }, [rows, gestorIds, clientById, bankByGestor])

  const persist = async (newRows: OptimizationScheduleRow[]) => {
    if (!profile) return
    await setOptimizationSchedule(newRows, profile.id)
  }

  // Auto-limpeza: remove do calendário linhas de clientes que não têm (ou
  // não têm mais) Tráfego Pago contratado — ex.: cliente só de Landing Page
  // cadastrado ali por engano (caso da "Dona Clean") — ou que foi excluído/
  // encerrado. Roda sozinha ao abrir a página; sem isso o cliente ficava
  // "fantasma" no documento mesmo já escondido da exibição pelos filtros
  // acima. Autolimitante: depois de limpar, `rows` atualiza via onSnapshot
  // sem mais linhas inválidas, então não roda de novo.
  useEffect(() => {
    if (!profile || rows.length === 0) return
    const invalidIds = new Set(
      rows
        .filter((r) => {
          const c = clientById[r.clientId]
          return !c || !isClientInOperation(c) || !hasContractedPaidTraffic(c)
        })
        .map((r) => r.clientId)
    )
    if (invalidIds.size === 0) return
    const cleaned = rows.filter((r) => !invalidIds.has(r.clientId))
    persist(cleaned).catch((err) => console.error('[OptimizationCalendarPage] falha ao limpar linhas inválidas', err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, clientById, profile?.id])

  /** Move (ou cria) 1 ocorrência (cliente + dia) pra outra célula (gestor +
   *  dia de destino). Regra de 2 dias por cliente: se o cliente já tem só 1
   *  dia (ou veio da área "Sem dia definido", sem dia de origem), arrastar
   *  CRIA/ADICIONA o dia; se já tem 2, arrastar TROCA o dia arrastado pelo
   *  novo, mantendo o outro dia intocado. A linha nunca é apagada por ficar
   *  com 0 dias — assim o cliente continua atribuído ao gestor certo na área
   *  "Sem dia definido" em vez de perder essa informação. */
  const computeMovedRows = (clientId: string, fromWeekday: number | 'bank', toGestorId: string, toWeekday: number) => {
    const next: OptimizationScheduleRow[] = rows.map((r) => ({ ...r, weekdays: [...r.weekdays] }))
    let row = next.find((r) => r.clientId === clientId)
    if (!row) {
      row = { clientId, userId: toGestorId, weekdays: [] }
      next.push(row)
    }
    if (row.weekdays.length >= 2 && typeof fromWeekday === 'number') {
      row.weekdays = row.weekdays.filter((d) => d !== fromWeekday)
    }
    row.userId = toGestorId
    if (!row.weekdays.includes(toWeekday)) row.weekdays.push(toWeekday)
    row.weekdays.sort((a, b) => a - b)
    return next
  }

  /** Botão "×" do chip — remove só aquele dia (o cliente continua no outro,
   *  se tiver, ou cai na área "Sem dia definido" se esse era o único). */
  const handleRemoveDay = (clientId: string, weekday: number) => {
    const client = clientById[clientId]
    const next: OptimizationScheduleRow[] = rows.map((r) => ({ ...r, weekdays: [...r.weekdays] }))
    const row = next.find((r) => r.clientId === clientId)
    if (!row) return
    row.weekdays = row.weekdays.filter((d) => d !== weekday)
    persist(next)
      .then(() => toast.success(`✅ ${client?.companyName ?? 'Cliente'} removido de ${WEEKDAY_COL_LABEL[weekday]}`))
      .catch((err) => {
        console.error(err)
        toast.error('Erro ao remover o dia')
      })
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
    const data = active.data.current as { clientId: string; gestorId: string; weekday: number | 'bank' } | undefined
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

    if (projectedCount >= 9) {
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

  /** Escolhe, pra cada cliente, o par de dias (não-consecutivos quando
   *  possível) que deixa a carga total dos 5 dias mais equilibrada — sempre
   *  greedy: escolhe o par com menor soma de carga atual, dia a dia. */
  const assignBalancedPairs = (clientIds: string[]): Record<string, [number, number]> => {
    const dayLoad: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    const assignment: Record<string, [number, number]> = {}
    for (const clientId of clientIds) {
      let best = PREFERRED_PAIRS[0]
      let bestLoad = Infinity
      for (const pair of PREFERRED_PAIRS) {
        const load = dayLoad[pair[0]] + dayLoad[pair[1]]
        if (load < bestLoad) {
          best = pair
          bestLoad = load
        }
      }
      assignment[clientId] = best
      dayLoad[best[0]] += 1
      dayLoad[best[1]] += 1
    }
    return assignment
  }

  const handleAutoBalancePreview = () => {
    const next: OptimizationScheduleRow[] = rows.map((r) => ({ ...r, weekdays: [...r.weekdays] }))
    let changed = 0

    for (const name of visibleGestores) {
      const gid = gestorIds[name]
      if (!gid) continue
      // Inclui também quem está na área "Sem dia definido" — o auto-balancear
      // é a forma mais rápida de encaixar esses clientes de uma vez.
      const idsFromRows = rows.filter((r) => r.userId === gid).map((r) => r.clientId)
      const idsFromBank = (bankByGestor[name] ?? []).map((c) => c.clientId)
      const clientIds = [...new Set([...idsFromRows, ...idsFromBank])]
        .filter((id) => clientById[id] && isClientInOperation(clientById[id]) && hasContractedPaidTraffic(clientById[id]))
        .sort((a, b) => clientById[a].companyName.localeCompare(clientById[b].companyName))

      const assignment = assignBalancedPairs(clientIds)

      for (const clientId of clientIds) {
        const [d1, d2] = assignment[clientId]
        const row = next.find((r) => r.clientId === clientId)
        const currentDays = [...(row?.weekdays ?? [])].sort((a, b) => a - b)
        const isSame = currentDays.length === 2 && currentDays[0] === d1 && currentDays[1] === d2
        if (!isSame) changed += 1
        if (row) {
          row.weekdays = [d1, d2]
          row.userId = gid
        } else {
          next.push({ clientId, userId: gid, weekdays: [d1, d2] })
        }
      }
    }

    if (changed === 0) {
      toast('Já está balanceado.')
      return
    }
    setBalancePreview({ rows: next, changed })
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

  /** Abre a janela de edição (clique no nome do cliente) — alternativa ao
   *  arrastar, que também funciona no celular e no teclado. */
  const openEdit = (clientId: string, fallbackGestorId: string) => {
    const row = rows.find((r) => r.clientId === clientId)
    setEditing({
      clientId,
      gestorId: row?.userId ?? fallbackGestorId,
      weekdays: [...(row?.weekdays ?? [])].sort((a, b) => a - b),
    })
  }

  const toggleEditDay = (d: number) =>
    setEditing((prev) =>
      prev
        ? {
            ...prev,
            weekdays: prev.weekdays.includes(d) ? prev.weekdays.filter((x) => x !== d) : [...prev.weekdays, d].sort((a, b) => a - b),
          }
        : prev
    )

  const handleSaveEdit = () => {
    if (!editing) return
    const client = clientById[editing.clientId]
    const next: OptimizationScheduleRow[] = rows.map((r) => ({ ...r, weekdays: [...r.weekdays] }))
    let row = next.find((r) => r.clientId === editing.clientId)
    if (!row) {
      row = { clientId: editing.clientId, userId: editing.gestorId, weekdays: [] }
      next.push(row)
    }
    row.userId = editing.gestorId
    row.weekdays = [...editing.weekdays].sort((a, b) => a - b)
    setEditing(null)
    persist(next)
      .then(() => toast.success(`✅ ${client?.companyName ?? 'Cliente'} atualizado`))
      .catch((err) => {
        console.error(err)
        toast.error('Erro ao salvar os dias')
      })
  }

  const today = todayWeekday()
  const editingClient = editing ? clientById[editing.clientId] : undefined
  const editingGestorName = editing ? GESTORES.find((n) => gestorIds[n] === editing.gestorId) : undefined
  const editingHasNeighbors = editing ? editing.weekdays.some((d) => editing.weekdays.includes(d + 1)) : false
  const dayTotal = (d: number) => visibleGestores.reduce((sum, n) => sum + (chipsByGestorDay[n]?.[d]?.length ?? 0), 0)
  const missingTotal = visibleGestores.reduce((sum, n) => sum + (bankByGestor[n]?.length ?? 0), 0)
  const queryHits = query.trim()
    ? clients.filter(
        (c) => isClientInOperation(c) && hasContractedPaidTraffic(c) && normalize(c.companyName).includes(normalize(query))
      ).length
    : 0

  return (
    <CalendarCtx.Provider value={{ query, openEdit }}>
      <div className="flex flex-col gap-5">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-[26px] font-extrabold leading-tight text-slate-900">
              <CalendarRange size={24} className="text-brand-600" /> Calendário de Otimizações
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Cada cliente de tráfego é otimizado 2 vezes por semana. Arraste entre os dias ou clique no nome para editar.
            </p>
          </div>
          {rows.length > 0 && (
            <Button variant="secondary" icon={<Wand2 size={14} />} onClick={handleAutoBalancePreview}>
              Auto-balancear
            </Button>
          )}
        </div>

        {/* Resumo por gestor */}
        {!loading && rows.length > 0 && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {summaryByGestor
              .filter((s) => visibleGestores.includes(s.name))
              .map((s) => {
                const gid = gestorIds[s.name]
                const photo = users.find((u) => u.id === gid)?.photoURL
                const missing = bankByGestor[s.name]?.length ?? 0
                const spread = s.max.count - s.min.count
                const balanced = spread <= 2
                const weekly = s.entries.reduce((sum, e) => sum + e.count, 0)
                return (
                  <div key={s.name} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center gap-2.5">
                      <Avatar name={s.name} photoURL={photo} size="sm" />
                      <p className="font-semibold text-slate-800">{s.name}</p>
                      <span
                        className={`ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}
                        title={`Diferença entre o dia mais cheio e o mais vazio: ${spread}`}
                      >
                        {balanced ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                        {balanced ? 'Equilibrado' : 'Desequilibrado'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                      <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                        <Stat label="Clientes" value={s.total} />
                        <Stat label="Otimizações / semana" value={weekly} />
                        <Stat label="Média por dia" value={(weekly / 5).toFixed(1).replace('.', ',')} />
                        <Stat label="Faltando dia" value={missing} tone={missing > 0 ? 'warn' : undefined} />
                      </div>
                      <div className="flex h-[74px] items-end gap-1.5" aria-label={`Carga por dia de ${s.name}`}>
                        {s.entries.map((e) => {
                          const h = Math.max(4, Math.round((e.count / s.maxCount) * 48))
                          const isMax = !balanced && e.day === s.max.day
                          return (
                            <div key={e.day} className="flex w-7 flex-col items-center gap-1" title={`${WEEKDAY_COL_LABEL[e.day]}: ${e.count}`}>
                              <span className="text-[10px] font-semibold tabular-nums text-slate-500">{e.count}</span>
                              <div
                                className={`w-full rounded-sm ${isMax ? 'bg-amber-400' : e.day === today ? 'bg-brand-500' : 'bg-slate-300'}`}
                                style={{ height: h }}
                              />
                              <span className={`text-[10px] ${e.day === today ? 'font-bold text-brand-600' : 'text-slate-400'}`}>
                                {WEEKDAY_SHORT_LABEL[e.day]}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        )}

        {/* Barra de ferramentas */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Gestor"
              value={gestorFilter}
              onChange={setGestorFilter}
              options={[
                { value: 'all', label: 'Todos' },
                { value: 'ciane', label: 'Ciane' },
                { value: 'nicolas', label: 'Nicolas' },
              ]}
            />
            <label className="relative min-w-[200px] flex-1">
              <span className="sr-only">Buscar cliente</span>
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cliente…"
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            {query.trim() && (
              <span className="text-xs text-slate-500">
                {queryHits} encontrado{queryHits === 1 ? '' : 's'}
              </span>
            )}
            <Segmented
              label="Visualização"
              value={view}
              onChange={setView}
              options={[
                { value: 'grid', label: 'Grade', icon: <LayoutGrid size={14} /> },
                { value: 'list', label: 'Lista', icon: <List size={14} /> },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="opt-legend-chip" data-chip="full" /> 2 dias
            </span>
            <span className="flex items-center gap-1.5">
              <span className="opt-legend-chip" data-chip="half" /> Falta 1 dia
            </span>
            <span className="flex items-center gap-1.5">
              <span className="opt-legend-chip" data-chip="none" /> Sem dia
            </span>
            <span className="hidden h-3 w-px bg-slate-200 sm:block" />
            <span className="flex items-center gap-1.5">
              <span data-load="low" className="opt-load rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">Leve</span> até 5
            </span>
            <span className="flex items-center gap-1.5">
              <span data-load="mid" className="opt-load rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">Médio</span> 6 a 8
            </span>
            <span className="flex items-center gap-1.5">
              <span data-load="high" className="opt-load rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">Cheio</span> 9 ou mais
            </span>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            {missingTotal > 0 && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {visibleGestores
                  .filter((name) => (bankByGestor[name]?.length ?? 0) > 0)
                  .map((name) => (
                    <BankArea key={name} name={name} gestorId={gestorIds[name] ?? ''} chips={bankByGestor[name] ?? []} />
                  ))}
              </div>
            )}

            {rows.length === 0 ? (
              <div className="flex flex-col items-start gap-3 rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex items-center gap-2 text-slate-600">
                  <Info size={16} className="text-slate-400" />
                  <p className="text-sm">Nenhum calendário cadastrado ainda.</p>
                </div>
                <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={handleSeed} loading={seeding}>
                  Importar calendário padrão
                </Button>
              </div>
            ) : view === 'grid' ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
                <div className="grid min-w-[880px] gap-2" style={{ gridTemplateColumns: '128px repeat(5, minmax(0, 1fr))' }}>
                  <div />
                  {OPTIMIZATION_WEEKDAYS.map((d) => (
                    <div
                      key={d}
                      className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold uppercase tracking-wide ${
                        d === today ? 'bg-brand-50 text-brand-700' : 'text-slate-500'
                      }`}
                    >
                      {WEEKDAY_COL_LABEL[d]}
                      <span className="font-medium normal-case tabular-nums text-slate-400">· {dayTotal(d)}</span>
                      {d === today && (
                        <span className="rounded-full bg-brand-600 px-1.5 py-px text-[9px] font-bold normal-case tracking-normal text-white">hoje</span>
                      )}
                    </div>
                  ))}
                  {visibleGestores.map((name) => {
                    const gid = gestorIds[name]
                    const photo = users.find((u) => u.id === gid)?.photoURL
                    const total = summaryByGestor.find((s) => s.name === name)?.total ?? 0
                    return (
                      <Fragment key={name}>
                        <div className="flex flex-col items-start justify-center gap-1.5 pr-2">
                          <Avatar name={name} photoURL={photo} size="sm" />
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{name}</p>
                            <p className="text-[11px] text-slate-400">
                              {total} cliente{total === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>
                        {OPTIMIZATION_WEEKDAYS.map((d) => (
                          <Cell
                            key={`${name}-${d}`}
                            gestorId={gid ?? ''}
                            weekday={d}
                            isToday={d === today}
                            chips={chipsByGestorDay[name]?.[d] ?? []}
                            onRemoveChip={handleRemoveDay}
                          />
                        ))}
                      </Fragment>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {OPTIMIZATION_WEEKDAYS.map((d) => {
                  const isCollapsed = collapsedDays.has(d)
                  return (
                    <div
                      key={d}
                      className={`overflow-hidden rounded-xl border bg-white ${d === today ? 'border-brand-300' : 'border-slate-200'}`}
                    >
                      <button
                        type="button"
                        aria-expanded={!isCollapsed}
                        onClick={() =>
                          setCollapsedDays((prev) => {
                            const next = new Set(prev)
                            if (next.has(d)) next.delete(d)
                            else next.add(d)
                            return next
                          })
                        }
                        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-slate-50"
                      >
                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
                        <span className="text-sm font-semibold text-slate-800">{WEEKDAY_FULL_LABEL[d]}</span>
                        {d === today && (
                          <span className="rounded-full bg-brand-600 px-1.5 py-px text-[10px] font-bold text-white">hoje</span>
                        )}
                        <span className="ml-auto text-xs tabular-nums text-slate-400">
                          {dayTotal(d)} otimizaç{dayTotal(d) === 1 ? 'ão' : 'ões'}
                        </span>
                      </button>
                      {!isCollapsed && (
                        <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-3 sm:grid-cols-2">
                          {visibleGestores.map((name) => {
                            const chips = chipsByGestorDay[name]?.[d] ?? []
                            const load = cellLoad(chips.length)
                            return (
                              <div key={name}>
                                <div className="mb-1.5 flex items-center gap-2">
                                  <p className="text-xs font-semibold text-slate-600">{name}</p>
                                  <span className="text-[11px] tabular-nums text-slate-400">
                                    {chips.length} cliente{chips.length === 1 ? '' : 's'}
                                  </span>
                                  <span data-load={load} className="opt-load ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                                    {LOAD_LABEL[load]}
                                  </span>
                                </div>
                                <Cell
                                  gestorId={gestorIds[name] ?? ''}
                                  weekday={d}
                                  chips={chips}
                                  compact
                                  isToday={d === today}
                                  onRemoveChip={handleRemoveDay}
                                />
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

        <Modal open={!!pendingMove} onClose={() => setPendingMove(null)} title="Dia sobrecarregado">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">Esse dia já tem 9 clientes ou mais. Mover mesmo assim?</p>
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
              carga por dia, mantendo os 2 dias de otimização por cliente (evitando dias seguidos quando possível).
              {gestorFilter !== 'all' && ` Só os clientes de ${visibleGestores[0]} entram.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setBalancePreview(null)}>
                Cancelar
              </Button>
              <Button onClick={confirmAutoBalance}>Confirmar</Button>
            </div>
          </div>
        </Modal>

        <Modal open={!!editing} onClose={() => setEditing(null)} title={editingClient?.companyName ?? 'Editar dias'}>
          {editing && (
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-500">Quem otimiza</p>
                <div className="flex flex-wrap gap-1.5">
                  {GESTORES.map((n) => {
                    const gid = gestorIds[n]
                    if (!gid) return null
                    const active = editing.gestorId === gid
                    return (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setEditing((prev) => (prev ? { ...prev, gestorId: gid } : prev))}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                          active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Avatar name={n} photoURL={users.find((u) => u.id === gid)?.photoURL} size="xs" />
                        {n}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-500">Dias da semana</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {OPTIMIZATION_WEEKDAYS.map((d) => {
                    const active = editing.weekdays.includes(d)
                    const others = editingGestorName
                      ? (chipsByGestorDay[editingGestorName]?.[d] ?? []).filter((c) => c.clientId !== editing.clientId).length
                      : 0
                    const load = cellLoad(others + 1)
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={active}
                        aria-label={`${WEEKDAY_FULL_LABEL[d]}, ${others} outros clientes`}
                        onClick={() => toggleEditDay(d)}
                        className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-2 transition-colors ${
                          active ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`text-sm font-semibold ${active ? 'text-brand-700' : 'text-slate-700'}`}>{WEEKDAY_SHORT_LABEL[d]}</span>
                        <span data-load={load} className="opt-load rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums">
                          {others}
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">O número é quantos outros clientes já estão naquele dia.</p>
              </div>

              {editing.weekdays.length !== 2 ? (
                <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <AlertTriangle size={13} className="shrink-0" />
                  {editing.weekdays.length === 0
                    ? 'Sem nenhum dia, o cliente vai para "Faltando dia".'
                    : editing.weekdays.length === 1
                      ? 'O padrão são 2 dias por semana.'
                      : `${editing.weekdays.length} dias marcados — o padrão são 2.`}
                </p>
              ) : editingHasNeighbors ? (
                <p className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  <Info size={13} className="shrink-0" /> Dias seguidos deixam muito tempo sem otimizar no resto da semana.
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveEdit}>Salvar</Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </CalendarCtx.Provider>
  )
}
