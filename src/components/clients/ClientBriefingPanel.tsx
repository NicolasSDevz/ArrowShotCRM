import { useEffect, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Save } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { updateClient } from '../../services/clientService'
import { markBriefingChecklistDone } from '../../services/taskService'
import { dateInputToTimestamp, timestampToDateInput } from '../../utils/dateInput'
import {
  APPROVAL_CHANNEL_LABEL,
  CLIENT_AUDIENCE_LABEL,
  type Client,
  type ClientAudience,
  type ClientBriefing,
} from '../../types/client'

const EMPTY: ClientBriefing = { preenchidoPor: 'Jamilson' }

const toDateInputValue = timestampToDateInput

function SectionTitle({ children }: { children: string }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</p>
}

export function ClientBriefingPanel({ client }: { client: Client }) {
  const { profile } = useAuth()
  const [form, setForm] = useState<ClientBriefing>(client.briefing ?? EMPTY)
  const [saving, setSaving] = useState(false)

  // Resync only when switching to another client — NOT on every `clients`
  // snapshot. `useClients` re-emits fresh objects on any client-collection
  // write anywhere in the app, and depending on `client.briefing` identity
  // here would wipe the user's unsaved edits mid-typing. This form is
  // manual-save by design, so a same-client server change is picked up on the
  // next mount, not live.
  useEffect(() => {
    setForm(client.briefing ?? EMPTY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id])

  const set = <K extends keyof ClientBriefing>(key: K, value: ClientBriefing[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    try {
      const payload: ClientBriefing = { ...form, filledAt: Timestamp.now() }
      await updateClient(client.id, { briefing: payload }, profile.id, profile.name)
      await markBriefingChecklistDone(client.id, profile.id, profile.name)
      toast.success('Briefing salvo')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar briefing')
    } finally {
      setSaving(false)
    }
  }

  const lastFilled = client.briefing?.filledAt

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-slate-400">
        Preencher na reunião de onboarding. Os dados de empresa, WhatsApp, cidade, pacote e catálogo já ficam no
        cadastro do cliente — aqui só o que é específico do briefing.
        {lastFilled && (
          <>
            {' '}
            Última vez salvo por <strong>{client.briefing?.preenchidoPor}</strong> em{' '}
            {format(lastFilled.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
          </>
        )}
      </p>

      <Field label="Preenchido por">
        <Input value={form.preenchidoPor ?? ''} onChange={(e) => set('preenchidoPor', e.target.value)} placeholder="Ex: Jamilson" />
      </Field>

      <div>
        <SectionTitle>Informações da empresa</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Há quanto tempo no mercado">
            <Input value={form.tempoMercado ?? ''} onChange={(e) => set('tempoMercado', e.target.value)} placeholder="Ex: 5 anos" />
          </Field>
          <Field label="Nº aproximado de obras entregues">
            <Input value={form.numeroObras ?? ''} onChange={(e) => set('numeroObras', e.target.value)} placeholder="Ex: 200+" />
          </Field>
        </div>
      </div>

      <div>
        <SectionTitle>Serviços e posicionamento</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Quais serviços oferece">
              <Textarea rows={2} value={form.servicos ?? ''} onChange={(e) => set('servicos', e.target.value)} />
            </Field>
          </div>
          <Field label="Atende">
            <Select value={form.atendeTipo ?? ''} onChange={(e) => set('atendeTipo', e.target.value as ClientAudience)}>
              <option value="">Selecione...</option>
              {Object.entries(CLIENT_AUDIENCE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ticket médio do serviço">
            <Input value={form.ticketMedio ?? ''} onChange={(e) => set('ticketMedio', e.target.value)} placeholder="Ex: R$ 1.500" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Principal diferencial da empresa">
              <Textarea rows={2} value={form.diferencial ?? ''} onChange={(e) => set('diferencial', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="O que não quer ser associado à empresa">
              <Textarea rows={2} value={form.naoAssociar ?? ''} onChange={(e) => set('naoAssociar', e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>Público-alvo</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Quem é o cliente ideal (perfil)">
              <Textarea rows={2} value={form.clienteIdeal ?? ''} onChange={(e) => set('clienteIdeal', e.target.value)} />
            </Field>
          </div>
          <Field label="Atende B2B (construtoras, arquitetos)?">
            <Select
              value={form.atendeB2B === undefined ? '' : form.atendeB2B ? 'sim' : 'nao'}
              onChange={(e) => set('atendeB2B', e.target.value === '' ? undefined : e.target.value === 'sim')}
            >
              <option value="">Selecione...</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </Select>
          </Field>
          <div />
          <div className="sm:col-span-2">
            <Field label="Principal dor do cliente antes de contratar">
              <Textarea rows={2} value={form.dorPrincipal ?? ''} onChange={(e) => set('dorPrincipal', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Objeção mais comum na venda">
              <Textarea rows={2} value={form.objecaoComum ?? ''} onChange={(e) => set('objecaoComum', e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>Identidade e tom de voz</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tom de voz desejado">
            <Input value={form.tomVoz ?? ''} onChange={(e) => set('tomVoz', e.target.value)} placeholder="Ex: técnico, acolhedor, direto" />
          </Field>
          <Field label="Cores da marca (hex ou referência)">
            <Input value={form.coresMarca ?? ''} onChange={(e) => set('coresMarca', e.target.value)} placeholder="Ex: #1A56A0" />
          </Field>
          <Field label="Referência de perfil que admira">
            <Input value={form.referenciaPerfil ?? ''} onChange={(e) => set('referenciaPerfil', e.target.value)} placeholder="@perfil" />
          </Field>
          <div />
          <div className="sm:col-span-2">
            <Field label="Algo que NÃO quer ver nos posts">
              <Textarea rows={2} value={form.naoQuerVer ?? ''} onChange={(e) => set('naoQuerVer', e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>Contrato e processo</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Data de início">
            <Input
              type="date"
              value={toDateInputValue(form.dataInicio)}
              onChange={(e) => set('dataInicio', dateInputToTimestamp(e.target.value))}
            />
          </Field>
          <Field label="Canal de aprovação">
            <Select value={form.canalAprovacao ?? ''} onChange={(e) => set('canalAprovacao', e.target.value as never)}>
              <option value="">Selecione...</option>
              {Object.entries(APPROVAL_CHANNEL_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Prazo máximo para aprovação de conteúdo">
              <Input value={form.prazoAprovacao ?? ''} onChange={(e) => set('prazoAprovacao', e.target.value)} placeholder="Ex: 2 dias úteis" />
            </Field>
          </div>
        </div>
      </div>

      <Button icon={<Save size={14} />} onClick={handleSave} loading={saving} className="self-start">
        Salvar briefing
      </Button>
    </div>
  )
}
