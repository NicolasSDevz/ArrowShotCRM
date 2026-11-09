import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { addMonths, format, isSameMonth } from 'date-fns'
import { Trash2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Field } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { deleteContent } from '../../services/contentService'
import { deleteContentMedia } from '../../services/contentMediaService'
import { monthLabel } from '../../services/socialMonthService'
import { askConfirm } from '../../utils/confirmDialog'
import type { Client } from '../../types/client'
import { CONTENT_FORMAT_LABEL, CONTENT_STATUS_LABEL, CONTENT_TYPE_LABEL, type Content } from '../../types/content'

/** Apaga vários posts de uma vez (ex.: um mês gerado errado). */
export function DeletePostsModal({
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
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const options = useMemo(() => [-1, 0, 1, 2].map((n) => addMonths(new Date(new Date().getFullYear(), new Date().getMonth(), 1), n)), [])
  const ofMonth = useMemo(
    () =>
      contents
        .filter((c) => c.scheduledDate && isSameMonth(c.scheduledDate.toDate(), month))
        .sort((a, b) => a.scheduledDate!.toMillis() - b.scheduledDate!.toMillis()),
    [contents, month]
  )
  const allOn = ofMonth.length > 0 && ofMonth.every((c) => selected.has(c.id))

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const handleDelete = async () => {
    if (!profile) return
    const chosen = ofMonth.filter((c) => selected.has(c.id))
    if (chosen.length === 0) return
    const ok = await askConfirm({
      title: `Apagar ${chosen.length} post(s)?`,
      message: 'Os posts e as artes enviadas saem do CRM. Não dá para desfazer.',
      confirmLabel: 'Apagar',
      danger: true,
    })
    if (!ok) return
    setDeleting(true)
    try {
      for (const c of chosen) {
        await deleteContent(c, profile.id, profile.name)
        for (const m of c.media ?? []) await deleteContentMedia(m)
      }
      toast.success(`${chosen.length} post(s) apagados`)
      setSelected(new Set())
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao apagar')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Apagar posts — ${client.companyName}`} width="max-w-xl">
      <div className="flex flex-col gap-4 px-5 py-4">
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
                    setSelected(new Set())
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
          <p className="text-sm text-slate-500">Nenhum post neste mês.</p>
        ) : (
          <div className="rounded-lg border border-slate-100">
            <label className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <input
                type="checkbox"
                checked={allOn}
                onChange={() => setSelected(allOn ? new Set() : new Set(ofMonth.map((c) => c.id)))}
                className="h-4 w-4 rounded border-slate-300 text-red-600"
              />
              Selecionar todos ({ofMonth.length})
            </label>
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {ofMonth.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm text-slate-700">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 rounded border-slate-300 text-red-600" />
                    <span className="w-12 shrink-0 text-xs text-slate-500">{format(c.scheduledDate!.toDate(), 'dd/MM')}</span>
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

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" icon={<Trash2 size={14} />} onClick={handleDelete} loading={deleting} disabled={selected.size === 0}>
            Apagar {selected.size || ''} post(s)
          </Button>
        </div>
      </div>
    </Modal>
  )
}
