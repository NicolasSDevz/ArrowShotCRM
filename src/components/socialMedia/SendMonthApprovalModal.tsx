import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { addDays, addMonths, format, isSameMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Copy, AlertTriangle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Field, Input, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { resolveAdminIds } from '../../utils/userLookup'
import { monthLabel, sendMonthForApproval } from '../../services/socialMonthService'
import type { Client } from '../../types/client'
import { CONTENT_FORMAT_LABEL, CONTENT_STATUS_LABEL, CONTENT_TYPE_LABEL, type Content } from '../../types/content'

const READY = new Set<Content['status']>(['review', 'waiting_client'])

/** Manda o mês inteiro para o cliente num link só. */
export function SendMonthApprovalModal({
  open,
  onClose,
  client,
  contents,
}: {
  open: boolean
  onClose: () => void
  client: Client
  contents: Content[]
}) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const [month, setMonth] = useState(() => addMonths(new Date(), new Date().getDate() >= 10 ? 1 : 0))
  const [deadline, setDeadline] = useState(() => format(addDays(new Date(), 2), 'yyyy-MM-dd'))
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [sending, setSending] = useState(false)
  const [url, setUrl] = useState<string | null>(null)

  const options = useMemo(() => [0, 1, 2].map((n) => addMonths(new Date(new Date().getFullYear(), new Date().getMonth(), 1), n)), [])
  const ofMonth = useMemo(
    () =>
      contents
        .filter((c) => c.status !== 'cancelled' && c.scheduledDate && isSameMonth(c.scheduledDate.toDate(), month))
        .sort((a, b) => a.scheduledDate!.toMillis() - b.scheduledDate!.toMillis()),
    [contents, month]
  )
  const selected = picked ?? new Set(ofMonth.filter((c) => READY.has(c.status)).map((c) => c.id))
  const chosen = ofMonth.filter((c) => selected.has(c.id))
  const missingArt = chosen.filter((c) => !c.media?.length)
  const missingCaption = chosen.filter((c) => !c.caption?.trim())

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  const message = url
    ? `Oi! Os posts de ${monthLabel(month).split(' de ')[0].toLowerCase()} da ${client.companyName} estão prontos para sua aprovação 😊\n\n` +
      `É só abrir o link, ver cada post e tocar em "Aprovar" ou "Pedir ajuste":\n${url}\n\n` +
      `Se puder, responde até ${format(new Date(`${deadline}T12:00:00`), "dd/MM (EEEE)", { locale: ptBR })}. ` +
      `Sem resposta até lá, a gente segue com o agendamento combinado.`
    : ''

  const handleSend = async () => {
    if (!profile || chosen.length === 0) return
    setSending(true)
    try {
      const link = await sendMonthForApproval({
        client,
        month,
        contents: chosen,
        deadline,
        notifyUserIds: resolveAdminIds(users),
        user: profile,
      })
      setUrl(link)
      await navigator.clipboard.writeText(link).catch(() => {})
      toast.success('Link criado e copiado')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao criar o link')
    } finally {
      setSending(false)
    }
  }

  const close = () => {
    setUrl(null)
    setPicked(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title={`Enviar para aprovação — ${client.companyName}`} width="max-w-xl">
      <div className="flex flex-col gap-4 px-5 py-4">
        {url ? (
          <>
            <Field label="Link do mês">
              <div className="flex gap-2">
                <Input readOnly value={url} onFocus={(e) => e.target.select()} />
                <Button variant="secondary" icon={<Copy size={13} />} onClick={() => navigator.clipboard.writeText(url).then(() => toast.success('Copiado'))}>
                  Copiar
                </Button>
              </div>
            </Field>
            <Field label="Mensagem para o WhatsApp">
              <Textarea rows={7} readOnly value={message} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" icon={<Copy size={13} />} onClick={() => navigator.clipboard.writeText(message).then(() => toast.success('Mensagem copiada'))}>
                Copiar mensagem
              </Button>
              <Button onClick={close}>Pronto</Button>
            </div>
          </>
        ) : (
          <>
            <Field label="Mês">
              <div className="flex flex-wrap gap-2">
                {options.map((m) => {
                  const active = format(m, 'yyyy-MM') === format(month, 'yyyy-MM')
                  return (
                    <button
                      key={m.toISOString()}
                      type="button"
                      onClick={() => {
                        setMonth(m)
                        setPicked(null)
                      }}
                      className={`rounded-lg border px-3 py-1.5 text-sm ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      {monthLabel(m)}
                    </button>
                  )
                })}
              </div>
            </Field>

            {ofMonth.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum post com data neste mês. Use "Gerar mês" primeiro.</p>
            ) : (
              <div className="rounded-lg border border-slate-100">
                <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {chosen.length} de {ofMonth.length} posts vão no link
                </p>
                <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
                  {ofMonth.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm text-slate-700">
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
                        <span className="w-14 shrink-0 text-xs text-slate-500">{format(c.scheduledDate!.toDate(), 'dd/MM')}</span>
                        <span className="min-w-0 flex-1 truncate">{c.title}</span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {CONTENT_FORMAT_LABEL[c.type] ?? CONTENT_TYPE_LABEL[c.type]} · {CONTENT_STATUS_LABEL[c.status]}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(missingArt.length > 0 || missingCaption.length > 0) && (
              <div className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div>
                  {missingArt.length > 0 && <p>{missingArt.length} post(s) sem arte: {missingArt.map((c) => format(c.scheduledDate!.toDate(), 'dd/MM')).join(', ')}</p>}
                  {missingCaption.length > 0 && <p>{missingCaption.length} post(s) sem legenda: {missingCaption.map((c) => format(c.scheduledDate!.toDate(), 'dd/MM')).join(', ')}</p>}
                </div>
              </div>
            )}

            <Field label="Prazo para o cliente responder">
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-44" />
            </Field>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={close}>
                Cancelar
              </Button>
              <Button onClick={handleSend} loading={sending} disabled={chosen.length === 0}>
                Criar link com {chosen.length} posts
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
