import { useMemo, useState } from 'react'
import { isWithinInterval, startOfDay, endOfDay } from 'date-fns'
import { Plus, Video } from 'lucide-react'
import { useAllMeetings } from '../hooks/useMeetings'
import { useClients } from '../hooks/useClients'
import { useUsers } from '../hooks/useUsers'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { MeetingFormModal } from '../components/meetings/MeetingFormModal'
import { MeetingDrawer } from '../components/meetings/MeetingDrawer'
import { MeetingRow } from '../components/meetings/MeetingRow'
import { MEETING_TYPE_LABEL, MEETING_TYPE_GROUP_LABEL, MEETING_TYPE_GROUPS, type MeetingType } from '../types'

export function MeetingsPage() {
  const { data: meetings } = useAllMeetings()
  const { data: clients } = useClients()
  const { data: users } = useUsers()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<MeetingType | ''>('')
  const [clientFilter, setClientFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [creating, setCreating] = useState(false)
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null)

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])
  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])
  const activeClients = clients.filter((c) => c.status === 'active')

  const openMeeting = meetings.find((m) => m.id === openMeetingId) ?? null

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const start = startDate ? startOfDay(new Date(`${startDate}T00:00:00`)) : null
    const end = endDate ? endOfDay(new Date(`${endDate}T00:00:00`)) : null

    return meetings.filter((m) => {
      if (typeFilter && m.type !== typeFilter) return false
      if (clientFilter && m.clientId !== clientFilter) return false
      const date = m.date.toDate()
      if (start && end && !isWithinInterval(date, { start, end })) return false
      if (start && !end && date < start) return false
      if (end && !start && date > end) return false

      if (needle) {
        const clientName = m.clientId ? clientMap[m.clientId]?.companyName : ''
        const participantNames = (m.participantIds ?? []).map((id) => userMap[id]?.name).join(' ')
        const haystack = [
          MEETING_TYPE_LABEL[m.type],
          m.agenda,
          m.decisions,
          m.notes,
          clientName,
          participantNames,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [meetings, typeFilter, clientFilter, startDate, endDate, search, clientMap, userMap])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900">Reuniões</h1>
          <p className="text-[15px] text-[#64748B]">Registro de decisões e atas</p>
        </div>
        <Button icon={<Plus size={14} />} onClick={() => setCreating(true)}>
          Nova reunião
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por pauta, decisão, cliente..."
          className="h-[38px] w-56 rounded-lg border border-slate-200 px-3 text-sm outline-none transition-all duration-150 ease-in-out focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as MeetingType | '')}
          className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Todos os tipos</option>
          {(Object.entries(MEETING_TYPE_GROUPS) as [keyof typeof MEETING_TYPE_GROUPS, MeetingType[]][]).map(([group, types]) => (
            <optgroup key={group} label={MEETING_TYPE_GROUP_LABEL[group]}>
              {types.map((t) => (
                <option key={t} value={t}>{MEETING_TYPE_LABEL[t]}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Todos os clientes</option>
          {activeClients.map((c) => (
            <option key={c.id} value={c.id}>{c.companyName}</option>
          ))}
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm outline-none transition-all duration-150 ease-in-out focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
        <span className="text-sm text-slate-400">até</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm outline-none transition-all duration-150 ease-in-out focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Video size={28} />}
          title="Nenhuma reunião encontrada"
          description="Ajuste os filtros ou registre uma nova reunião."
          action={
            <Button size="sm" icon={<Plus size={13} />} onClick={() => setCreating(true)}>
              Nova reunião
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((m) => (
            <MeetingRow
              key={m.id}
              meeting={m}
              clientName={m.clientId ? clientMap[m.clientId]?.companyName : undefined}
              participants={(m.participantIds ?? []).map((id) => userMap[id]).filter((u): u is NonNullable<typeof u> => !!u)}
              onClick={() => setOpenMeetingId(m.id)}
            />
          ))}
        </div>
      )}

      <MeetingFormModal open={creating} onClose={() => setCreating(false)} />
      <MeetingDrawer key={`meeting-${openMeetingId ?? 'none'}`} meeting={openMeeting} onClose={() => setOpenMeetingId(null)} />
    </div>
  )
}
