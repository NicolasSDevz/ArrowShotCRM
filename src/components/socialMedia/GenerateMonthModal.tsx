import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { addMonths, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Modal } from '../ui/Modal'
import { Field } from '../ui/Field'
import { Button } from '../ui/Button'
import { SocialPlanEditor } from './SocialPlanEditor'
import { useAuth } from '../../context/AuthContext'
import { updateClient } from '../../services/clientService'
import { generateMonth, monthLabel, planMonth } from '../../services/socialMonthService'
import type { Client } from '../../types/client'
import type { Content } from '../../types/content'
import type { SocialPlan } from '../../types/socialPlan'

/** Cria os posts do mês a partir da grade do plano do cliente, já com data,
 *  formato e pilar, na coluna "Produzir". */
export function GenerateMonthModal({
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
  const [plan, setPlan] = useState<SocialPlan | null>(client.socialPlan ?? null)
  const [month, setMonth] = useState(() => addMonths(new Date(), new Date().getDate() >= 10 ? 1 : 0))
  const [saving, setSaving] = useState(false)

  const options = useMemo(() => [0, 1, 2].map((n) => addMonths(new Date(new Date().getFullYear(), new Date().getMonth(), 1), n)), [])
  const preview = useMemo(() => (plan ? planMonth(plan, month, contents) : []), [plan, month, contents])
  const newCount = preview.filter((p) => !p.exists).length
  const planChanged = JSON.stringify(plan) !== JSON.stringify(client.socialPlan ?? null)

  const handleGenerate = async () => {
    if (!profile || !plan) return
    setSaving(true)
    try {
      if (planChanged) await updateClient(client.id, { socialPlan: plan }, profile.id, profile.name)
      const startOrder = contents.reduce((m, c) => Math.max(m, c.order ?? 0), 0) + 1
      const n = await generateMonth(client, plan, preview, profile, startOrder)
      toast.success(n ? `${n} posts criados em ${monthLabel(month)}` : 'Nada novo para criar')
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao gerar o mês')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Gerar mês — ${client.companyName}`} width="max-w-xl">
      <div className="flex flex-col gap-4 px-5 py-4">
        <Field label="Mês">
          <div className="flex flex-wrap gap-2">
            {options.map((m) => {
              const active = format(m, 'yyyy-MM') === format(month, 'yyyy-MM')
              return (
                <button
                  key={m.toISOString()}
                  type="button"
                  onClick={() => setMonth(m)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                >
                  {monthLabel(m)}
                </button>
              )
            })}
          </div>
        </Field>

        <Field label="Plano do cliente" hint={planChanged && client.socialPlan ? 'A mudança fica salva no cadastro do cliente.' : undefined}>
          <SocialPlanEditor value={plan} onChange={setPlan} />
        </Field>

        {plan && (
          <div className="rounded-lg border border-slate-100">
            <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {preview.length} posts no mês · {newCount} novos
            </p>
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {preview.map((p, i) => (
                <li key={i} className={`flex items-center gap-3 px-3 py-1.5 text-sm ${p.exists ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                  <span className="w-20 shrink-0 text-xs text-slate-500">{format(p.date, 'EEE dd/MM', { locale: ptBR })}</span>
                  <span className="truncate">{p.title}</span>
                  {p.exists && <span className="ml-auto shrink-0 text-xs no-underline">já existe</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-slate-500">
          Os posts entram em "Produzir" com o tema em aberto. Depois é só preencher legenda e arte, ou importar o calendário pronto.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} loading={saving} disabled={!plan || newCount === 0}>
            Criar {newCount} posts
          </Button>
        </div>
      </div>
    </Modal>
  )
}
