import { useState, useMemo, useEffect } from 'react'
import { format, addMonths, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Timestamp } from 'firebase/firestore'
import { CalendarDays, CheckSquare, Square } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import { useJornada } from '../../hooks/useJornada'
import { useClientMeetings } from '../../hooks/useMeetings'
import {
  saveJornadaField,
  saveJornadaSubitens,
  marcarMesFeito,
  desmarcarMes,
} from '../../services/jornadaService'
import { updateClient } from '../../services/clientService'
import { MAQUINAS_JORNADA, MESES_JORNADA } from '../../config/jornadaCliente'
import type { MesJornadaConfig } from '../../config/jornadaCliente'
import type { JornadaMes, JornadaMesSubitens } from '../../types/jornada'
import type { Client, Meeting } from '../../types'
import { MEETING_TYPE_LABEL } from '../../types/meeting'

// ---------- status helpers ----------

type MesStatus = 'feita' | 'atual' | 'atrasada' | 'futura'

function getMesStatus(
  mes: string,
  jornadaDoc: JornadaMes | undefined,
  dataInicio: Date | null,
): MesStatus {
  if (jornadaDoc?.status === 'feita') return 'feita'
  if (!dataInicio) return 'futura'
  const mesNum = parseInt(mes, 10)
  const expectedStart = startOfMonth(addMonths(dataInicio, mesNum - 1))
  const expectedEnd = endOfMonth(expectedStart)
  const today = new Date()
  if (today < expectedStart) return 'futura'
  if (today > expectedEnd) return 'atrasada'
  return 'atual'
}

const CARD_BG: Record<MesStatus, string> = {
  feita:    'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30',
  atual:    'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30',
  atrasada: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30',
  futura:   'border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800/40',
}

const DOT_BG: Record<MesStatus, string> = {
  feita:    'bg-emerald-500',
  atual:    'bg-blue-500',
  atrasada: 'bg-red-500',
  futura:   'bg-slate-300 dark:bg-slate-600',
}

const STATUS_BADGE: Record<MesStatus, string> = {
  feita:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400',
  atual:    'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400',
  atrasada: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400',
  futura:   'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
}

const STATUS_LABEL: Record<MesStatus, string> = {
  feita: 'Feita', atual: 'Mês atual', atrasada: 'Atrasada', futura: 'Futura',
}

const MAQUINA_STYLE: Record<number, { border: string; bg: string; title: string; sub: string }> = {
  1: { border: 'border-l-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950/20',   title: 'text-blue-800 dark:text-blue-200',   sub: 'text-blue-600 dark:text-blue-400' },
  2: { border: 'border-l-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/20', title: 'text-violet-800 dark:text-violet-200', sub: 'text-violet-600 dark:text-violet-400' },
  3: { border: 'border-l-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/20', title: 'text-emerald-800 dark:text-emerald-200', sub: 'text-emerald-600 dark:text-emerald-400' },
}

// ---------- JornadaCard ----------

interface CardProps {
  config: MesJornadaConfig
  doc: JornadaMes | undefined
  mesStatus: MesStatus
  canEdit: boolean
  meetings: Meeting[]
  clientId: string
  jornadaFeitas: string[]
  userId: string
  userName: string
}

function JornadaCard({
  config, doc, mesStatus, canEdit, meetings, clientId, jornadaFeitas, userId, userName,
}: CardProps) {
  const [localObs, setLocalObs] = useState(doc?.observacoes ?? '')
  const [localDate, setLocalDate] = useState(
    doc?.dataReuniao ? format(doc.dataReuniao.toDate(), 'yyyy-MM-dd') : '',
  )
  const [localSubitens, setLocalSubitens] = useState<JornadaMesSubitens>(doc?.subitens ?? {})
  const [saving, setSaving] = useState(false)

  const isDone = doc?.status === 'feita'

  const handleToggleDone = async () => {
    if (!canEdit || saving) return
    setSaving(true)
    try {
      if (isDone) {
        if (!window.confirm('Desmarcar esta reunião como feita?')) return
        await desmarcarMes(clientId, config.mes, userId, jornadaFeitas)
      } else {
        await marcarMesFeito(clientId, config.mes, userId, userName, jornadaFeitas, !!doc?.dataReuniao)
        toast.success('Reunião marcada como feita!')
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const handleBlurObs = async () => {
    if (!canEdit || localObs === (doc?.observacoes ?? '')) return
    try {
      await saveJornadaField(clientId, config.mes, { observacoes: localObs }, userId)
    } catch {
      toast.error('Erro ao salvar observações')
    }
  }

  const handleBlurDate = async () => {
    if (!canEdit) return
    const current = doc?.dataReuniao ? format(doc.dataReuniao.toDate(), 'yyyy-MM-dd') : ''
    if (localDate === current) return
    try {
      let ts: Timestamp | null = null
      if (localDate) {
        const [y, m, d] = localDate.split('-').map(Number)
        ts = Timestamp.fromDate(new Date(y, m - 1, d))
      }
      await saveJornadaField(clientId, config.mes, { dataReuniao: ts }, userId)
    } catch {
      toast.error('Erro ao salvar data')
    }
  }

  const handleToggleSubitem = async (key: keyof JornadaMesSubitens) => {
    if (!canEdit) return
    const updated = { ...localSubitens, [key]: !localSubitens[key] }
    setLocalSubitens(updated)
    try {
      await saveJornadaSubitens(clientId, config.mes, updated, userId)
    } catch {
      toast.error('Erro ao salvar')
    }
  }

  const handleLinkMeeting = async (meetingId: string) => {
    if (!canEdit) return
    try {
      if (!meetingId) {
        await saveJornadaField(clientId, config.mes, { reuniaoVinculadaId: null }, userId)
        return
      }
      const meeting = meetings.find((m) => m.id === meetingId)
      if (!meeting) return
      await saveJornadaField(clientId, config.mes, {
        reuniaoVinculadaId: meetingId,
        dataReuniao: meeting.date,
      }, userId)
      setLocalDate(format(meeting.date.toDate(), 'yyyy-MM-dd'))
      toast.success('Reunião vinculada')
    } catch {
      toast.error('Erro ao vincular reunião')
    }
  }

  const inputBase =
    'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 ' +
    'focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 ' +
    'disabled:cursor-default disabled:opacity-60 ' +
    'dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:focus:border-blue-500 dark:focus:ring-blue-900/30'

  const mesNum = parseInt(config.mes, 10)
  const cardLabel = `Mês ${mesNum} — ${config.tema} — ${STATUS_LABEL[mesStatus]}`

  return (
    <div
      role="region"
      aria-label={cardLabel}
      className={`rounded-xl border p-4 ${CARD_BG[mesStatus]}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${DOT_BG[mesStatus]}`}
          >
            {config.mes}
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">{config.tema}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{config.descricao}</p>
          </div>
        </div>
        <span aria-hidden="true" className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[mesStatus]}`}>
          {STATUS_LABEL[mesStatus]}
        </span>
      </div>

      {/* Checkbox reunião feita */}
      <div className="mt-4">
        <button
          onClick={handleToggleDone}
          disabled={!canEdit || saving}
          aria-pressed={isDone}
          aria-label={isDone ? 'Desmarcar reunião como feita' : 'Marcar reunião como feita'}
          className={[
            'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            isDone
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
              : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600',
            !canEdit ? 'cursor-default opacity-70' : '',
          ].join(' ')}
        >
          {isDone
            ? <CheckSquare aria-hidden="true" size={18} className="text-emerald-600 dark:text-emerald-400" />
            : <Square aria-hidden="true" size={18} className="text-slate-400" />}
          Reunião feita
        </button>
      </div>

      {/* Data da reunião */}
      <div className="mt-4">
        <label
          htmlFor={`data-reuniao-${config.mes}`}
          className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
        >
          Data da reunião
        </label>
        <input
          id={`data-reuniao-${config.mes}`}
          type="date"
          value={localDate}
          onChange={(e) => setLocalDate(e.target.value)}
          onBlur={handleBlurDate}
          disabled={!canEdit}
          className={inputBase}
        />
      </div>

      {/* Observações */}
      <div className="mt-4">
        <label
          htmlFor={`obs-${config.mes}`}
          className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
        >
          Observações
        </label>
        <textarea
          id={`obs-${config.mes}`}
          value={localObs}
          onChange={(e) => setLocalObs(e.target.value)}
          onBlur={handleBlurObs}
          disabled={!canEdit}
          rows={3}
          placeholder="O que foi combinado, próximos passos..."
          className={`w-full resize-none ${inputBase} py-2`}
        />
      </div>

      {/* Subitens — apenas mês 01 */}
      {config.subitens && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Pautas</p>
          {config.subitens.map((sub) => (
            <label
              key={sub.key}
              className={`flex items-start gap-2 ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <input
                type="checkbox"
                checked={!!localSubitens[sub.key as keyof JornadaMesSubitens]}
                onChange={() => handleToggleSubitem(sub.key as keyof JornadaMesSubitens)}
                disabled={!canEdit}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span className="text-sm text-slate-600 dark:text-slate-300">{sub.label}</span>
            </label>
          ))}
        </div>
      )}

      {/* Vincular reunião */}
      {canEdit && meetings.length > 0 && (
        <div className="mt-4">
          <label
            htmlFor={`vincular-${config.mes}`}
            className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            Vincular a uma reunião
          </label>
          <select
            id={`vincular-${config.mes}`}
            value={doc?.reuniaoVinculadaId ?? ''}
            onChange={(e) => handleLinkMeeting(e.target.value)}
            className={inputBase}
          >
            <option value="">— Nenhuma vinculada —</option>
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {MEETING_TYPE_LABEL[m.type]} — {format(m.date.toDate(), 'dd/MM/yyyy', { locale: ptBR })}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Feita em ... por ... */}
      {isDone && doc?.concluidoPor && doc.concluidoEm && (
        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
          Feita em {format(doc.concluidoEm.toDate(), "dd/MM 'às' HH:mm", { locale: ptBR })} por {doc.concluidoPor.nome}
        </p>
      )}
    </div>
  )
}

// ---------- ClientJornadaTab ----------

export function ClientJornadaTab({ client }: { client: Client }) {
  const { profile } = useAuth()
  const { data: jornadaDocs, loading } = useJornada(client.id)
  const { data: meetings } = useClientMeetings(client.id)

  const canEdit = profile?.role === 'admin' || profile?.role === 'manager'

  const jornadaMap = useMemo(
    () => new Map(jornadaDocs.map((d) => [d.id, d])),
    [jornadaDocs],
  )

  const dataInicio: Date | null = useMemo(() => {
    const ts = client.dataInicioJornada ?? client.contractStartDate ?? client.createdAt
    return ts?.toDate() ?? null
  }, [client.dataInicioJornada, client.contractStartDate, client.createdAt])

  const [dataInicioInput, setDataInicioInput] = useState(
    () => (dataInicio ? format(dataInicio, 'yyyy-MM-dd') : ''),
  )

  useEffect(() => {
    setDataInicioInput(dataInicio ? format(dataInicio, 'yyyy-MM-dd') : '')
  }, [dataInicio])

  const handleSaveDataInicio = async () => {
    if (!profile || !dataInicioInput) return
    try {
      const [y, m, d] = dataInicioInput.split('-').map(Number)
      await updateClient(
        client.id,
        { dataInicioJornada: Timestamp.fromDate(new Date(y, m - 1, d)) },
        profile.id,
        profile.name,
      )
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar data de início')
    }
  }

  const jornadaFeitas = client.jornadaFeitas ?? []
  const totalFeitas = jornadaFeitas.length

  const currentMaquinaNome = useMemo(() => {
    if (!dataInicio) return null
    for (const mes of MESES_JORNADA) {
      const d = jornadaMap.get(mes.mes)
      const s = getMesStatus(mes.mes, d, dataInicio)
      if (s === 'atual' || s === 'atrasada') {
        return MAQUINAS_JORNADA.find((mq) => mq.id === mes.maquina)?.subtitulo ?? null
      }
    }
    return totalFeitas === 12 ? 'Jornada concluída 🎉' : null
  }, [jornadaMap, dataInicio, totalFeitas])

  const handleAtivarJornada = async () => {
    if (!profile) return
    try {
      await updateClient(
        client.id,
        { participaJornada: true, dataInicioJornada: Timestamp.now() },
        profile.id,
        profile.name,
      )
      toast.success('Jornada ativada!')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao ativar jornada')
    }
  }

  if (client.participaJornada === false) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-base text-slate-500">Este cliente não está na Jornada do Cliente.</p>
        {canEdit && (
          <button
            onClick={handleAtivarJornada}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Ativar jornada
          </button>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="flex h-32 items-center justify-center">
        <span className="text-sm text-slate-400">Carregando jornada...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-1">
      {/* Barra de progresso */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
              {totalFeitas} de 12 reuniões feitas
            </p>
            {currentMaquinaNome && (
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{currentMaquinaNome}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays aria-hidden="true" size={14} className="text-slate-400" />
            <label htmlFor="data-inicio-jornada" className="text-xs text-slate-500 dark:text-slate-400">
              Início da jornada:
            </label>
            <input
              id="data-inicio-jornada"
              type="date"
              value={dataInicioInput}
              onChange={(e) => setDataInicioInput(e.target.value)}
              onBlur={handleSaveDataInicio}
              disabled={!canEdit}
              className={
                'rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 ' +
                'focus:border-blue-400 focus:outline-none disabled:cursor-default disabled:opacity-70 ' +
                'dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200'
              }
            />
          </div>
        </div>
        <div
          role="progressbar"
          aria-valuenow={totalFeitas}
          aria-valuemin={0}
          aria-valuemax={12}
          aria-label={`Progresso da jornada: ${totalFeitas} de 12 reuniões feitas`}
          className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        >
          <div
            aria-hidden="true"
            className="h-2.5 rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${(totalFeitas / 12) * 100}%` }}
          />
        </div>
        <p aria-hidden="true" className="mt-1.5 text-right text-xs text-slate-400">
          {Math.round((totalFeitas / 12) * 100)}%
        </p>
      </div>

      {/* Blocos por Máquina */}
      {MAQUINAS_JORNADA.map((maquina) => {
        const style = MAQUINA_STYLE[maquina.id]
        const meses = MESES_JORNADA.filter((m) => m.maquina === maquina.id)
        return (
          <div key={maquina.id} className="flex flex-col gap-3">
            <div className={`rounded-xl border-l-4 px-4 py-3 ${style.border} ${style.bg}`}>
              <h2 className={`font-semibold ${style.title}`}>{maquina.nome}</h2>
              <p className={`text-sm ${style.sub}`}>{maquina.subtitulo}</p>
            </div>
            {meses.map((config) => {
              const jornadaDoc = jornadaMap.get(config.mes)
              const mesStatus = getMesStatus(config.mes, jornadaDoc, dataInicio)
              return (
                <JornadaCard
                  key={`${config.mes}-${jornadaDoc?.updatedAt?.toMillis() ?? 0}`}
                  config={config}
                  doc={jornadaDoc}
                  mesStatus={mesStatus}
                  canEdit={canEdit}
                  meetings={meetings}
                  clientId={client.id}
                  jornadaFeitas={jornadaFeitas}
                  userId={profile?.id ?? ''}
                  userName={profile?.name ?? ''}
                />
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
