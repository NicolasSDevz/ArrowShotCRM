import { useMemo, useState } from 'react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  format,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Sparkles, CheckSquare, Video, Plus, LogOut, CalendarClock, Cake } from 'lucide-react'
import { useAllContents } from '../hooks/useContents'
import { useAllTasks } from '../hooks/useTasks'
import { useAllMeetings } from '../hooks/useMeetings'
import { useClients } from '../hooks/useClients'
import { useGoogleCalendar } from '../hooks/useGoogleCalendar'
import { useCalendarEvents } from '../hooks/useCalendarEvents'
import { upcomingBirthdays } from '../services/birthdayService'
import { birthdayWhatsappLink } from '../utils/birthdayMessage'
import { useTaskVisibility, filterVisibleTasks } from '../utils/taskVisibility'
import { MEETING_TYPE_LABEL } from '../types/meeting'
import { TaskDrawer } from '../components/tasks/TaskDrawer'
import { ContentDrawer } from '../components/content/ContentDrawer'
import { MeetingDrawer } from '../components/meetings/MeetingDrawer'
import { NewMeetingModal } from '../components/calendar/NewMeetingModal'
import { Button } from '../components/ui/Button'

type CalItem = {
  id: string
  title: string
  // 'meeting' = evento do Google Calendar sincronizado; 'internalMeeting' =
  // registro do módulo de Reuniões da plataforma (ver types/meeting.ts).
  kind: 'task' | 'content' | 'meeting' | 'internalMeeting' | 'event' | 'birthday'
  date: Date
  clientName?: string
  link?: string
}

const KIND_STYLE: Record<CalItem['kind'], string> = {
  content: 'bg-brand-50 text-brand-700',
  task: 'bg-blue-50 text-blue-700',
  meeting: 'bg-amber-50 text-amber-700',
  internalMeeting: 'bg-indigo-50 text-indigo-700',
  event: 'bg-violet-50 text-violet-700',
  birthday: 'bg-pink-50 text-pink-700',
}

export function CalendarPage() {
  const { data: allTasks } = useAllTasks()
  const { canSeeAllTasks, viewerId } = useTaskVisibility()
  const tasks = useMemo(() => filterVisibleTasks(allTasks, canSeeAllTasks, viewerId), [allTasks, canSeeAllTasks, viewerId])
  const { data: contents } = useAllContents()
  const { data: meetings } = useAllMeetings()
  const { data: clients } = useClients()
  const { data: calendarEvents } = useCalendarEvents()
  const google = useGoogleCalendar()
  const [mode, setMode] = useState<'month' | 'week'>('month')
  const [cursor, setCursor] = useState(new Date())
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [openContentId, setOpenContentId] = useState<string | null>(null)
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null)
  const [creatingMeeting, setCreatingMeeting] = useState(false)

  const openTask = tasks.find((t) => t.id === openTaskId) ?? null
  const openContent = contents.find((c) => c.id === openContentId) ?? null
  const openInternalMeeting = meetings.find((m) => m.id === openMeetingId) ?? null
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]))

  const items: CalItem[] = useMemo(() => {
    const fromTasks: CalItem[] = tasks
      .filter((t) => t.dueDate)
      .map((t) => ({
        id: t.id,
        title: t.title,
        kind: 'task',
        date: t.dueDate!.toDate(),
        clientName: t.clientId ? clientMap[t.clientId]?.companyName : undefined,
      }))
    const fromContents: CalItem[] = contents
      .filter((c) => c.scheduledDate)
      .map((c) => ({
        id: c.id,
        title: c.title,
        kind: 'content',
        date: c.scheduledDate!.toDate(),
        clientName: clientMap[c.clientId]?.companyName,
      }))
    const fromMeetings: CalItem[] = google.events.map((ev) => ({
      id: ev.id,
      title: ev.summary,
      kind: 'meeting',
      date: new Date(ev.start),
      link: ev.hangoutLink || ev.htmlLink,
    }))
    const fromEvents: CalItem[] = calendarEvents
      .filter((ev) => ev.type !== 'birthday')
      .map((ev) => ({
        id: ev.id,
        title: ev.title,
        kind: 'event',
        date: ev.date.toDate(),
        clientName: ev.clientId ? clientMap[ev.clientId]?.companyName : undefined,
      }))
    // Aniversários: recorrentes — renderiza a ocorrência de cada ano visível.
    const cursorYear = cursor.getFullYear()
    const fromBirthdays: CalItem[] = calendarEvents
      .filter((ev) => ev.type === 'birthday' && ev.birthdayMonth && ev.birthdayDay)
      .flatMap((ev) =>
        [cursorYear - 1, cursorYear, cursorYear + 1].map((y) => ({
          id: `${ev.id}-${y}`,
          title: ev.title,
          kind: 'birthday' as const,
          date: new Date(y, ev.birthdayMonth! - 1, ev.birthdayDay!),
          clientName: ev.clientId ? clientMap[ev.clientId]?.companyName : undefined,
          link: birthdayWhatsappLink(ev.contactName ?? '', ev.contactWhatsapp),
        }))
      )
    const fromInternalMeetings: CalItem[] = meetings.map((m) => {
      const clientName = m.clientId ? clientMap[m.clientId]?.companyName : undefined
      return {
        id: m.id,
        title: clientName ? `${MEETING_TYPE_LABEL[m.type]} — ${clientName}` : MEETING_TYPE_LABEL[m.type],
        kind: 'internalMeeting',
        date: m.date.toDate(),
        clientName,
      }
    })
    return [...fromTasks, ...fromContents, ...fromMeetings, ...fromEvents, ...fromBirthdays, ...fromInternalMeetings]
  }, [tasks, contents, clientMap, google.events, calendarEvents, meetings, cursor])

  const birthdays30 = useMemo(() => upcomingBirthdays(calendarEvents, 30), [calendarEvents])

  const rangeStart = mode === 'month' ? startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 }) : startOfWeek(cursor, { weekStartsOn: 0 })
  const rangeEnd = mode === 'month' ? endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 }) : endOfWeek(cursor, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd })

  const openItem = (item: CalItem) => {
    if (item.kind === 'task') setOpenTaskId(item.id)
    else if (item.kind === 'content') setOpenContentId(item.id)
    else if (item.kind === 'internalMeeting') setOpenMeetingId(item.id)
    else if (item.link) window.open(item.link, '_blank', 'noreferrer')
  }

  const navigate = (dir: -1 | 1) => {
    setCursor((c) => (mode === 'month' ? (dir === 1 ? addMonths(c, 1) : subMonths(c, 1)) : dir === 1 ? addWeeks(c, 1) : subWeeks(c, 1)))
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900">Calendário</h1>
          <p className="text-[15px] text-[#64748B]">Publicações, prazos e reuniões.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            <button
              onClick={() => setMode('month')}
              className={`rounded-md px-3 py-1 text-xs font-medium ${mode === 'month' ? 'bg-brand-100 text-brand-700' : 'text-slate-500'}`}
            >
              Mês
            </button>
            <button
              onClick={() => setMode('week')}
              className={`rounded-md px-3 py-1 text-xs font-medium ${mode === 'week' ? 'bg-brand-100 text-brand-700' : 'text-slate-500'}`}
            >
              Semana
            </button>
          </div>
          <button onClick={() => navigate(-1)} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50">
            <ChevronLeft size={15} />
          </button>
          <p className="w-36 text-center text-sm font-medium text-slate-700">
            {format(cursor, mode === 'month' ? 'MMMM yyyy' : "'semana de' dd MMM", { locale: ptBR })}
          </p>
          <button onClick={() => navigate(1)} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50">
            <ChevronRight size={15} />
          </button>

          <div className="ml-0 flex items-center gap-1.5 border-l border-slate-200 pl-2 sm:ml-2">
            {google.connected ? (
              <>
                <Button size="sm" icon={<Plus size={13} />} onClick={() => setCreatingMeeting(true)}>
                  Nova reunião
                </Button>
                <button
                  onClick={google.disconnect}
                  title="Desconectar Google Calendar"
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                >
                  <LogOut size={14} />
                </button>
              </>
            ) : (
              <Button size="sm" variant="secondary" icon={<Video size={13} />} onClick={google.connect} loading={google.loading}>
                Conectar Google Calendar
              </Button>
            )}
          </div>
        </div>
      </div>

      {birthdays30.length > 0 && (
        <div className="rounded-xl border border-pink-100 bg-pink-50/60 p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-pink-700">
            <Cake size={15} /> Próximos aniversários
          </p>
          <ul className="flex flex-col divide-y divide-pink-100">
            {birthdays30.map((b) => {
              const wa = birthdayWhatsappLink(b.name, b.whatsapp)
              return (
                <li key={b.eventId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
                  <span className="w-28 shrink-0 font-medium text-pink-700">
                    {b.daysUntil === 0
                      ? 'hoje'
                      : b.daysUntil === 1
                        ? 'amanhã'
                        : `em ${b.daysUntil} dias`}{' '}
                    <span className="text-pink-400">· {format(b.next, 'dd/MM')}</span>
                  </span>
                  <span className="font-medium text-slate-800">{b.name}</span>
                  {b.clientId && clientMap[b.clientId] && (
                    <span className="text-slate-400">— {clientMap[b.clientId].companyName}</span>
                  )}
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-xs font-medium text-emerald-600 hover:underline"
                    >
                      Abrir WhatsApp
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <div className="grid min-w-[640px] grid-cols-7 gap-px bg-slate-100">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
            <div key={d} className="bg-slate-50 px-2 py-1.5 text-center text-[11px] font-semibold uppercase text-slate-400">
              {d}
            </div>
          ))}
          {days.map((day) => {
            const dayItems = items.filter((i) => isSameDay(i.date, day))
            const outside = mode === 'month' && !isSameMonth(day, cursor)
            return (
              <div
                key={day.toISOString()}
                className={`flex flex-col gap-1 bg-white p-1.5 ${mode === 'month' ? 'min-h-[100px]' : 'min-h-[260px]'} ${
                  outside ? 'bg-slate-50/50' : ''
                }`}
              >
                <span className={`text-xs font-medium ${outside ? 'text-slate-300' : 'text-slate-500'}`}>
                  {format(day, 'd')}
                </span>
                <div className="flex flex-col gap-1">
                  {dayItems.slice(0, mode === 'month' ? 3 : 8).map((item) => (
                    <button
                      key={`${item.kind}-${item.id}`}
                      onClick={() => openItem(item)}
                      className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium ${KIND_STYLE[item.kind]}`}
                      title={item.title}
                    >
                      {item.kind === 'content' && <Sparkles size={10} />}
                      {item.kind === 'task' && <CheckSquare size={10} />}
                      {item.kind === 'meeting' && <Video size={10} />}
                      {item.kind === 'internalMeeting' && <Video size={10} />}
                      {item.kind === 'event' && <CalendarClock size={10} />}
                      {item.kind === 'birthday' && <Cake size={10} />}
                      <span className="truncate">{item.title}</span>
                    </button>
                  ))}
                  {dayItems.length > 3 && mode === 'month' && (
                    <span className="px-1.5 text-[10px] text-slate-400">+{dayItems.length - 3} mais</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <TaskDrawer key={`task-${openTaskId ?? 'none'}`} task={openTask} onClose={() => setOpenTaskId(null)} />
      <ContentDrawer key={`content-${openContentId ?? 'none'}`} content={openContent} onClose={() => setOpenContentId(null)} />
      <MeetingDrawer key={`meeting-${openMeetingId ?? 'none'}`} meeting={openInternalMeeting} onClose={() => setOpenMeetingId(null)} />
      <NewMeetingModal open={creatingMeeting} onClose={() => setCreatingMeeting(false)} onCreated={google.refresh} />
    </div>
  )
}
