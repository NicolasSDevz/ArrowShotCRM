import { useState } from 'react'
import toast from 'react-hot-toast'
import { ArrowUpRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { logActivity } from '../../services/activityService'
import { maskCurrencyInput, parseCurrencyToNumber } from '../../utils/masks'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'

/** "Registrar upsell" — widget do Operacional, só pro Admin (Bruno). Registro
 *  MANUAL e independente da ficha do cliente: complementa a detecção
 *  automática (ver describeUpsell em ClientFormModal, disparada ao editar
 *  módulos/valor do cliente), pra cobrir upsells que não mudam módulo nem
 *  valor mensal (ex: serviço avulso). Usa o mesmo `action: 'upsell'` já lido
 *  pelo card "Upsell" e pelo gráfico de receita do painel Visão Geral — só
 *  este fluxo preenche o campo `amount` estruturado. */
export function RegisterUpsellWidget() {
  const { profile } = useAuth()
  const { data: clients } = useClients()

  const [clientId, setClientId] = useState('')
  const [description, setDescription] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [saving, setSaving] = useState(false)

  if (profile?.role !== 'admin') return null

  const reset = () => {
    setClientId('')
    setDescription('')
    setAmountStr('')
  }

  const handleSubmit = async () => {
    const client = clients.find((c) => c.id === clientId)
    if (!client || !description.trim() || !profile || saving) return
    setSaving(true)
    try {
      await logActivity({
        entityType: 'client',
        entityId: client.id,
        clientId: client.id,
        action: 'upsell',
        message: description.trim(),
        amount: parseCurrencyToNumber(amountStr),
        userId: profile.id,
        userName: profile.name,
      })
      toast.success('✅ Upsell registrado!')
      reset()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao registrar upsell')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500">
          <ArrowUpRight size={15} className="text-white" />
        </div>
        <p className="text-[16px] font-semibold text-slate-900">Registrar upsell</p>
      </div>

      <Field label="Cliente" required>
        <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Selecione...</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.companyName}</option>
          ))}
        </Select>
      </Field>

      <Field label="O que foi vendido" required>
        <Textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: Contratou pacote extra de conteúdo para Instagram"
        />
      </Field>

      <Field label="Valor (R$) — opcional">
        <Input value={amountStr} onChange={(e) => setAmountStr(maskCurrencyInput(e.target.value))} placeholder="R$ 0,00" />
      </Field>

      <Button onClick={handleSubmit} loading={saving} disabled={!clientId || !description.trim()} className="self-start">
        Registrar upsell
      </Button>
    </div>
  )
}
