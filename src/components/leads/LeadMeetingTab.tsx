import { useState, useEffect } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Video, Mic, Copy, RotateCcw, X, CalendarCheck } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { useLeadPipelines } from '../../hooks/useLeadPipelines'
import {
  requestAccessToken,
  createMeetingEvent,
  updateMeetingEvent,
  deleteCalendarEvent,
} from '../../services/googleCalendarService'
import {
  createMeeting,
  updateMeeting,
  deleteMeeting,
  subscribeLeadMeetings,
} from '../../services/meetingService'
import { moveLeadStatus } from '../../services/leadService'
import { locateLead } from '../../types'
import { MEETING_DURATIONS, meetingStartEnd } from '../../types/meeting'
import type { Lead } from '../../types'
import type { Meeting } from '../../types/meeting'
import { Button } from '../ui/Button'
import { Field, Input, Select } from '../ui/Field'
import { askConfirm } from '../../utils/confirmDialog'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function nowTimeStr() {
  const d = new Date()
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function LeadMeetingTab({ lead }: { lead: Lead }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { data: users } = useUsers()
  const { pipelines } = useLeadPipelines()

  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loadingMeetings, setLoadingMeetings] = useState(true)

  const [dateStr, setDateStr] = useState(todayStr)
  const [timeStr, setTimeStr] = useState(nowTimeStr)
  const [durationMin, setDurationMin] = useState(45)
  const [attendeeEmail, setAttendeeEmail] = useState(lead.email ?? '')
  const [teamIds, setTeamIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [rescheduleId, setRescheduleId] = useState<string | null>(null)

  const canSchedule = profile?.role === 'admin' || profile?.role === 'manager'

  useEffect(() => {
    setLoadingMeetings(true)
    const unsub = subscribeLeadMeetings(
      lead.id,
      (items) => {
        setMeetings(items)
        setLoadingMeetings(false)
      },
      () => setLoadingMeetings(false)
    )
    return unsub
  }, [lead.id])

  // Pre-select Bruno by default when users load
  useEffect(() => {
    if (users.length === 0 || teamIds.length > 0) return
    const bruno = users.find((u) => u.name.toLowerCase().startsWith('bruno'))
    if (bruno) setTeamIds([bruno.id])
  }, [users, teamIds.length])

  const toggleTeamMember = (id: string) =>
    setTeamIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const buildAttendeeEmails = () => {
    const emails: string[] = []
    if (attendeeEmail.trim()) emails.push(attendeeEmail.trim())
    for (const id of teamIds) {
      const u = users.find((x) => x.id === id)
      if (u?.email) emails.push(u.email)
    }
    return [...new Set(emails)]
  }

  const handleSchedule = async (existingMeeting?: Meeting) => {
    if (!profile) return
    if (!dateStr || !timeStr) {
      toast.error('Preencha data e horário')
      return
    }
    setSaving(true)
    try {
      const token = await requestAccessToken(false)
      const start = new Date(`${dateStr}T${timeStr}:00`)
      const end = new Date(start.getTime() + durationMin * 60_000)
      const startISO = start.toISOString()
      const endISO = end.toISOString()
      const summary = `Reunião Arrow Shot — ${lead.contactName}`
      const allEmails = buildAttendeeEmails()

      let googleEventId: string
      let meetLink: string | undefined

      if (existingMeeting?.googleEventId) {
        const evt = await updateMeetingEvent(token, existingMeeting.googleEventId, {
          summary,
          startDateTime: startISO,
          endDateTime: endISO,
          attendeeEmails: allEmails,
        })
        googleEventId = evt.id
        meetLink = evt.hangoutLink
      } else {
        const evt = await createMeetingEvent(token, {
          summary,
          startDateTime: startISO,
          endDateTime: endISO,
          attendeeEmails: allEmails,
        })
        googleEventId = evt.id
        meetLink = evt.hangoutLink
      }

      const meetingData = {
        type: 'sales' as const,
        date: Timestamp.fromDate(start),
        time: timeStr,
        durationMin,
        participantIds: teamIds,
        actionItems: [],
        meetLink,
        googleEventId,
        leadId: lead.id,
      }

      if (existingMeeting) {
        await updateMeeting(existingMeeting.id, meetingData, profile.id, profile.name)
        toast.success('Reunião remarcada!')
      } else {
        await createMeeting(meetingData, profile.id, profile.name)
        // Move lead para etapa de reunião agendada, se existir no pipeline
        const { pipeline, stage } = locateLead(pipelines, lead)
        const meetingStage = pipeline.stages.find((s) => s.id === 'meeting_scheduled')
        if (meetingStage && stage.id !== 'meeting_scheduled') {
          await moveLeadStatus(lead, 'meeting_scheduled', Date.now(), profile.id, profile.name, undefined, pipeline)
        }
        toast.success('Reunião agendada! Convite enviado por e-mail.')
      }
      setRescheduleId(null)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Erro ao agendar reunião')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async (meeting: Meeting) => {
    if (!(await askConfirm({ title: 'Cancelar reunião?', message: 'O evento será removido do Google Agenda e os convidados serão notificados.', confirmLabel: 'Cancelar reunião', danger: true }))) return
    setSaving(true)
    try {
      if (meeting.googleEventId) {
        const token = await requestAccessToken(false)
        await deleteCalendarEvent(token, meeting.googleEventId)
      }
      await deleteMeeting(meeting, profile!.id, profile!.name)
      toast.success('Reunião cancelada')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao cancelar reunião')
    } finally {
      setSaving(false)
    }
  }

  const startReschedule = (meeting: Meeting) => {
    const range = meetingStartEnd(meeting)
    if (range) {
      setDateStr(format(range.start, 'yyyy-MM-dd'))
      setTimeStr(format(range.start, 'HH:mm'))
    }
    setDurationMin(meeting.durationMin ?? 45)
    setAttendeeEmail(lead.email ?? '')
    setRescheduleId(meeting.id)
  }

  const copyWhatsAppInvite = (meeting: Meeting) => {
    const range = meetingStartEnd(meeting)
    const dateLabel = range ? format(range.start, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : ''
    const text = `Olá! Sua reunião com a Arrow Shot está agendada para ${dateLabel}.\nLink do Meet: ${meeting.meetLink ?? '(sem link)'}`
    navigator.clipboard.writeText(text).then(() => toast.success('Convite copiado!')).catch(() => toast.error('Não foi possível copiar'))
  }

  if (loadingMeetings) {
    return <p className="py-4 text-center text-sm text-slate-400">Carregando...</p>
  }

  const activeMeeting = meetings.find((m) => m.type === 'sales' && m.id !== rescheduleId) ?? null
  const showForm = !activeMeeting || rescheduleId !== null

  return (
    <div className="flex flex-col gap-4">
      {activeMeeting && rescheduleId === null && (
        <div className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950/30">
          <div className="flex items-center gap-2">
            <CalendarCheck size={16} className="text-brand-600" />
            <span className="text-sm font-semibold text-brand-700 dark:text-brand-300">Reunião agendada</span>
          </div>
          {(() => {
            const range = meetingStartEnd(activeMeeting)
            if (!range) return null
            return (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {format(range.start, "EEEE, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                {activeMeeting.durationMin ? ` — ${activeMeeting.durationMin} min` : ''}
              </p>
            )
          })()}
          <div className="flex flex-wrap gap-2">
            {activeMeeting.meetLink && (
              <a
                href={activeMeeting.meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                <Video size={14} />
                Entrar na reunião
              </a>
            )}
            {(profile?.role === 'admin' || profile?.role === 'manager') && (
              <button
                onClick={() => {
                  // Abre o Meet numa aba nova e já deixa o Copiloto pronto pra
                  // iniciar na aba atual — menos troca de tela pra começar.
                  if (activeMeeting.meetLink) window.open(activeMeeting.meetLink, '_blank', 'noopener,noreferrer')
                  navigate(`/copiloto/${lead.id}`)
                }}
                className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:border-brand-700 dark:bg-transparent dark:text-brand-300"
              >
                <Mic size={14} />
                Entrar com Copiloto
              </button>
            )}
          </div>
          {!lead.email && activeMeeting.meetLink && (
            <button
              onClick={() => copyWhatsAppInvite(activeMeeting)}
              className="flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-400"
            >
              <Copy size={13} />
              Copiar convite para WhatsApp
            </button>
          )}
          {canSchedule && (
            <div className="flex gap-2 border-t border-brand-200 pt-3 dark:border-brand-800">
              <button
                onClick={() => startReschedule(activeMeeting)}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
              >
                <RotateCcw size={13} />
                Remarcar
              </button>
              <button
                onClick={() => handleCancel(activeMeeting)}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-600 disabled:opacity-50"
              >
                <X size={13} />
                Cancelar reunião
              </button>
            </div>
          )}
        </div>
      )}

      {showForm && canSchedule && (
        <div className="flex flex-col gap-3">
          {rescheduleId && (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Remarcar reunião</p>
              <button onClick={() => setRescheduleId(null)} className="text-xs text-slate-400 hover:text-slate-600">
                Cancelar
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data">
              <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} />
            </Field>
            <Field label="Horário">
              <Input type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} />
            </Field>
          </div>
          <Field label="Duração">
            <Select value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))}>
              {MEETING_DURATIONS.map((d) => (
                <option key={d.minutes} value={d.minutes}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="E-mail do lead">
            {!lead.email && (
              <p className="mb-1 text-xs text-amber-600">Lead sem e-mail — o convite não será enviado automaticamente.</p>
            )}
            <Input
              type="email"
              placeholder="email@exemplo.com"
              value={attendeeEmail}
              onChange={(e) => setAttendeeEmail(e.target.value)}
            />
          </Field>
          <Field label="Membros da equipe">
            <div className="flex flex-wrap gap-2 pt-1">
              {users
                .filter((u) => u.role !== 'client')
                .map((u) => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={teamIds.includes(u.id)}
                      onChange={() => toggleTeamMember(u.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 accent-brand-600"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{u.name.split(' ')[0]}</span>
                  </label>
                ))}
            </div>
          </Field>
          <Button
            onClick={() => handleSchedule(rescheduleId ? meetings.find((m) => m.id === rescheduleId) : undefined)}
            loading={saving}
            disabled={!dateStr || !timeStr}
            className="self-start"
          >
            {rescheduleId ? 'Confirmar nova data' : 'Agendar reunião'}
          </Button>
        </div>
      )}

      {!canSchedule && !activeMeeting && (
        <p className="text-sm text-slate-400">Nenhuma reunião agendada ainda.</p>
      )}
    </div>
  )
}
