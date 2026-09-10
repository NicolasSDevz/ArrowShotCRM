import { useEffect, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Save, Plus, X } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { updateClient } from '../../services/clientService'
import { markBriefingChecklistDone } from '../../services/taskService'
import { notifyBriefingFilled } from '../../services/clientWorkflowTemplates'
import { syncClientBirthdays } from '../../services/birthdayService'
import { dateInputToTimestamp, timestampToDateInput } from '../../utils/dateInput'
import { maskPhone } from '../../utils/masks'
import {
  EMPTY_PAID_TRAFFIC_BRIEFING,
  CREDIT_CARD_FOR_ADS_LABEL,
  type Client,
  type PaidTrafficBriefing,
  type BriefingContact,
  type CreditCardForAds,
} from '../../types'

const toDateInputValue = timestampToDateInput

function toNumberOrUndefined(v: string) {
  return v === '' ? undefined : Number(v)
}

function SectionTitle({ children }: { children: string }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</p>
}

function ContactListField({
  label,
  contacts,
  onChange,
}: {
  label: string
  contacts: BriefingContact[]
  onChange: (contacts: BriefingContact[]) => void
}) {
  const update = (id: string, patch: Partial<BriefingContact>) =>
    onChange(contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  const add = () => onChange([...contacts, { id: crypto.randomUUID(), name: '', email: '', whatsapp: '', birthday: null }])
  const remove = (id: string) => onChange(contacts.filter((c) => c.id !== id))

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="mb-2 text-sm font-medium text-slate-700">{label}</p>
      <div className="flex flex-col gap-2">
        {contacts.map((c, i) => (
          <div key={c.id} className="grid grid-cols-1 items-end gap-2 rounded-md bg-slate-50 p-2 sm:grid-cols-[1fr_1fr_150px_150px_auto]">
            <Field label="Nome">
              <Input value={c.name} onChange={(e) => update(c.id, { name: e.target.value })} />
            </Field>
            <Field label="E-mail">
              <Input type="email" value={c.email} onChange={(e) => update(c.id, { email: e.target.value })} />
            </Field>
            <Field label="WhatsApp">
              <Input
                value={c.whatsapp ?? ''}
                onChange={(e) => update(c.id, { whatsapp: maskPhone(e.target.value) })}
                placeholder="(00) 00000-0000"
              />
            </Field>
            <Field label="Aniversário">
              <Input
                type="date"
                value={toDateInputValue(c.birthday)}
                onChange={(e) => update(c.id, { birthday: dateInputToTimestamp(e.target.value) })}
              />
            </Field>
            {i > 0 && (
              <button
                onClick={() => remove(c.id)}
                aria-label="Remover contato"
                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
              >
                <X size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" icon={<Plus size={13} />} onClick={add} className="mt-2">
        Adicionar outro
      </Button>
    </div>
  )
}

export function ClientPaidTrafficBriefingPanel({ client }: { client: Client }) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const [form, setForm] = useState<PaidTrafficBriefing>(client.paidTrafficBriefing ?? EMPTY_PAID_TRAFFIC_BRIEFING)
  const [saving, setSaving] = useState(false)

  // Resync only on client switch — see ClientBriefingPanel: depending on the
  // sub-object identity would wipe unsaved edits on every `clients` snapshot.
  useEffect(() => {
    setForm(client.paidTrafficBriefing ?? EMPTY_PAID_TRAFFIC_BRIEFING)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id])

  const set = <K extends keyof PaidTrafficBriefing>(key: K, value: PaidTrafficBriefing[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    try {
      const payload: PaidTrafficBriefing = { ...form, preenchidoPor: profile.name, filledAt: Timestamp.now() }
      await updateClient(client.id, { paidTrafficBriefing: payload }, profile.id, profile.name)
      await markBriefingChecklistDone(client.id, profile.id, profile.name)
      await notifyBriefingFilled(client, profile.id, profile.name, users)
      // Aniversários dos responsáveis -> eventos recorrentes no calendário.
      await syncClientBirthdays(client, payload, profile.id).catch((err) =>
        console.error('[briefing] falha ao sincronizar aniversários', err)
      )
      toast.success('Briefing salvo')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar briefing')
    } finally {
      setSaving(false)
    }
  }

  const lastFilled = client.paidTrafficBriefing?.filledAt

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-slate-400">
        Preenchido pelo CS durante ou logo após a call de briefing com o cliente.
        {lastFilled && (
          <>
            {' '}
            Última vez salvo por <strong>{client.paidTrafficBriefing?.preenchidoPor}</strong> em{' '}
            {format(lastFilled.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
          </>
        )}
      </p>

      <div>
        <SectionTitle>1. Responsáveis</SectionTitle>
        <div className="flex flex-col gap-2.5">
          <ContactListField label="Sócio/Diretor" contacts={form.socios} onChange={(v) => set('socios', v)} />
          <ContactListField label="Tomador de decisões" contacts={form.decisores} onChange={(v) => set('decisores', v)} />
          <ContactListField
            label="Responsável pela aprovação das campanhas"
            contacts={form.aprovadoresCampanhas}
            onChange={(v) => set('aprovadoresCampanhas', v)}
          />
          <ContactListField label="Responsável pelo financeiro" contacts={form.financeiro} onChange={(v) => set('financeiro', v)} />
          <ContactListField label="Responsável pelo marketing" contacts={form.marketing} onChange={(v) => set('marketing', v)} />
          <ContactListField label="Responsável pelo comercial" contacts={form.comercial} onChange={(v) => set('comercial', v)} />
        </div>
      </div>

      <div>
        <SectionTitle>2. Comercial</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Como o time comercial está estruturado">
            <Textarea rows={2} value={form.estruturaTime ?? ''} onChange={(e) => set('estruturaTime', e.target.value)} />
          </Field>
          <Field label="Como funciona o processo de vendas">
            <Textarea rows={2} value={form.processoVendas ?? ''} onChange={(e) => set('processoVendas', e.target.value)} />
          </Field>
          <Field label="Sistema usado para gestão de leads">
            <Input value={form.sistemaGestaoLeads ?? ''} onChange={(e) => set('sistemaGestaoLeads', e.target.value)} />
          </Field>
          <Field label="Ciclo de venda">
            <Input value={form.cicloVenda ?? ''} onChange={(e) => set('cicloVenda', e.target.value)} />
          </Field>
          <Field label="Canal que mais vende">
            <Input value={form.canalQueMaisVende ?? ''} onChange={(e) => set('canalQueMaisVende', e.target.value)} />
          </Field>
          <Field label="Tempo de mercado da empresa">
            <Input value={form.tempoDeMercado ?? ''} onChange={(e) => set('tempoDeMercado', e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Percepção da empresa perante o mercado">
              <Textarea rows={2} value={form.percepcaoMercado ?? ''} onChange={(e) => set('percepcaoMercado', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Desafios atuais">
              <Textarea rows={2} value={form.desafiosAtuais ?? ''} onChange={(e) => set('desafiosAtuais', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Objeção mais comum">
              <Textarea rows={2} value={form.objecaoComum ?? ''} onChange={(e) => set('objecaoComum', e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>3. Marketing</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="O que espera como resultado?">
              <Textarea rows={2} value={form.resultadoEsperado ?? ''} onChange={(e) => set('resultadoEsperado', e.target.value)} />
            </Field>
          </div>
          <Field label="Meses de maior movimento">
            <Input value={form.mesesMaisFortes ?? ''} onChange={(e) => set('mesesMaisFortes', e.target.value)} />
          </Field>
          <Field label="Meses mais fracos">
            <Input value={form.mesesMaisFracos ?? ''} onChange={(e) => set('mesesMaisFracos', e.target.value)} />
          </Field>
          <Field label="Ticket médio (R$)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.ticketMedio ?? ''}
              onChange={(e) => set('ticketMedio', toNumberOrUndefined(e.target.value))}
            />
          </Field>
          <Field label="Faturamento mensal estimado (R$)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.faturamentoMensal ?? ''}
              onChange={(e) => set('faturamentoMensal', toNumberOrUndefined(e.target.value))}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Formas de pagamento aceitas">
              <Input value={form.formasPagamento ?? ''} onChange={(e) => set('formasPagamento', e.target.value)} />
            </Field>
          </div>
          <Field label="Possui cartão de crédito para pagar anúncios?">
            <Select value={form.cartaoCreditoAnuncios ?? ''} onChange={(e) => set('cartaoCreditoAnuncios', e.target.value as CreditCardForAds)}>
              <option value="">Selecione...</option>
              {(Object.entries(CREDIT_CARD_FOR_ADS_LABEL) as [CreditCardForAds, string][]).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div>
        <SectionTitle>4. Perfil do cliente ideal — B2C</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Gênero">
            <Input value={form.b2cGenero ?? ''} onChange={(e) => set('b2cGenero', e.target.value)} />
          </Field>
          <Field label="Estado civil e filhos">
            <Input value={form.b2cEstadoCivilFilhos ?? ''} onChange={(e) => set('b2cEstadoCivilFilhos', e.target.value)} />
          </Field>
          <Field label="Faixa etária">
            <Input value={form.b2cFaixaEtaria ?? ''} onChange={(e) => set('b2cFaixaEtaria', e.target.value)} />
          </Field>
          <Field label="Escolaridade e profissão">
            <Input value={form.b2cEscolaridadeProfissao ?? ''} onChange={(e) => set('b2cEscolaridadeProfissao', e.target.value)} />
          </Field>
          <Field label="Região onde mora">
            <Input value={form.b2cRegiao ?? ''} onChange={(e) => set('b2cRegiao', e.target.value)} />
          </Field>
          <div />
          <div className="sm:col-span-2">
            <Field label="Dor principal antes de contratar">
              <Textarea rows={2} value={form.b2cDorPrincipal ?? ''} onChange={(e) => set('b2cDorPrincipal', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Soluções que já tentou antes">
              <Textarea rows={2} value={form.b2cSolucoesTentadas ?? ''} onChange={(e) => set('b2cSolucoesTentadas', e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>5. Perfil do cliente ideal — B2B</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Setor">
            <Input value={form.b2bSetor ?? ''} onChange={(e) => set('b2bSetor', e.target.value)} />
          </Field>
          <Field label="Faturamento mínimo (R$)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.b2bFaturamentoMinimo ?? ''}
              onChange={(e) => set('b2bFaturamentoMinimo', toNumberOrUndefined(e.target.value))}
            />
          </Field>
          <Field label="Quantidade de funcionários">
            <Input value={form.b2bQuantidadeFuncionarios ?? ''} onChange={(e) => set('b2bQuantidadeFuncionarios', e.target.value)} />
          </Field>
          <Field label="Cargo do decisor">
            <Input value={form.b2bCargoDecisor ?? ''} onChange={(e) => set('b2bCargoDecisor', e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Localização">
              <Input value={form.b2bLocalizacao ?? ''} onChange={(e) => set('b2bLocalizacao', e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>6. Observações gerais</SectionTitle>
        <Textarea rows={3} value={form.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} />
      </div>

      <Button icon={<Save size={14} />} onClick={handleSave} loading={saving} className="self-start">
        Salvar briefing
      </Button>
    </div>
  )
}
