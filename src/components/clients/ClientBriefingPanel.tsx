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
import { notifyAdminsOfAction } from '../../services/notificationService'
import {
  APPROVAL_CHANNEL_LABEL,
  BRIEFING_TONE_OF_VOICE_LABEL,
  CLIENT_AUDIENCE_LABEL,
  type ApprovalChannel,
  type BriefingToneOfVoice,
  type Client,
  type ClientAudience,
  type ClientBriefing,
} from '../../types/client'

const EMPTY: ClientBriefing = { preenchidoPor: 'Jamilson' }

function SectionTitle({ n, children }: { n: number; children: string }) {
  return (
    <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] text-slate-500">{n}</span>
      {children}
    </p>
  )
}

/** Select Sim / Não. undefined = "Selecione...". */
function YesNo({
  label,
  value,
  onChange,
}: {
  label: string
  value?: boolean
  onChange: (v: boolean | undefined) => void
}) {
  return (
    <Field label={label}>
      <Select
        value={value === undefined ? '' : value ? 'sim' : 'nao'}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'sim')}
      >
        <option value="">Selecione...</option>
        <option value="sim">Sim</option>
        <option value="nao">Não</option>
      </Select>
    </Field>
  )
}

export function ClientBriefingPanel({ client }: { client: Client }) {
  const { profile } = useAuth()
  const [form, setForm] = useState<ClientBriefing>(client.briefing ?? EMPTY)
  const [saving, setSaving] = useState(false)

  // Resync só ao trocar de cliente — não a cada snapshot de `clients` (ver
  // ClientCampaignPlanningPanel). Formulário é save manual por design.
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
      const first = !client.briefing?.filledAt
      await updateClient(client.id, { briefing: payload }, profile.id, profile.name)
      await markBriefingChecklistDone(client.id, profile.id, profile.name)
      await notifyAdminsOfAction({
        type: 'briefing_filled',
        message: `${profile.name} ${first ? 'preencheu' : 'atualizou'} o briefing de Social Mídia — ${client.companyName}`,
        actorId: profile.id,
        actorName: profile.name,
        entityType: 'client',
        entityId: client.id,
      })
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
    <div className="flex flex-col gap-6">
      <p className="text-xs text-slate-400">
        Briefing de Social Mídia — preencher na reunião de onboarding. Empresa, WhatsApp, cidade, pacote e catálogo já
        ficam no cadastro do cliente.
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

      {/* SEÇÃO 1 */}
      <div>
        <SectionTitle n={1}>Informações da empresa</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Há quanto tempo no mercado">
            <Input value={form.tempoMercado ?? ''} onChange={(e) => set('tempoMercado', e.target.value)} placeholder="Ex: 5 anos" />
          </Field>
          <Field label="Nº aproximado de obras / serviços entregues">
            <Input value={form.numeroObras ?? ''} onChange={(e) => set('numeroObras', e.target.value)} placeholder="Ex: 200+" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Principais serviços oferecidos">
              <Textarea rows={2} value={form.servicos ?? ''} onChange={(e) => set('servicos', e.target.value)} />
            </Field>
          </div>
          <Field label="Atende">
            <Select value={form.atendeTipo ?? ''} onChange={(e) => set('atendeTipo', (e.target.value || undefined) as ClientAudience)}>
              <option value="">Selecione...</option>
              {(Object.entries(CLIENT_AUDIENCE_LABEL) as [ClientAudience, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ticket médio do serviço (R$)">
            <Input value={form.ticketMedio ?? ''} onChange={(e) => set('ticketMedio', e.target.value)} placeholder="Ex: R$ 1.500" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Principal diferencial da empresa">
              <Textarea rows={2} value={form.diferencial ?? ''} onChange={(e) => set('diferencial', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="O que NÃO quer ser associado à marca">
              <Textarea rows={2} value={form.naoAssociar ?? ''} onChange={(e) => set('naoAssociar', e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      {/* SEÇÃO 2 */}
      <div>
        <SectionTitle n={2}>Público-alvo</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Perfil do cliente ideal">
              <Textarea rows={2} value={form.clienteIdeal ?? ''} onChange={(e) => set('clienteIdeal', e.target.value)} />
            </Field>
          </div>
          <YesNo label="Atende B2B?" value={form.atendeB2B} onChange={(v) => set('atendeB2B', v)} />
          <Field label="Se sim: qual setor?">
            <Input
              value={form.setorB2B ?? ''}
              onChange={(e) => set('setorB2B', e.target.value)}
              disabled={form.atendeB2B !== true}
              placeholder="Ex: construtoras, arquitetos"
            />
          </Field>
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

      {/* SEÇÃO 3 */}
      <div>
        <SectionTitle n={3}>Identidade e tom de voz</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tom de voz desejado">
            <Select value={form.tomVoz ?? ''} onChange={(e) => set('tomVoz', e.target.value || undefined)}>
              <option value="">Selecione...</option>
              {(Object.entries(BRIEFING_TONE_OF_VOICE_LABEL) as [BriefingToneOfVoice, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Cores da marca (hex ou referência)">
            <Input value={form.coresMarca ?? ''} onChange={(e) => set('coresMarca', e.target.value)} placeholder="Ex: #1A56A0" />
          </Field>
          <Field label="Referência de perfil que admira">
            <Input value={form.referenciaPerfil ?? ''} onChange={(e) => set('referenciaPerfil', e.target.value)} placeholder="Ex: @perfil no Instagram" />
          </Field>
          <div />
          <div className="sm:col-span-2">
            <Field label="Algo que NÃO quer ver nos posts">
              <Textarea rows={2} value={form.naoQuerVer ?? ''} onChange={(e) => set('naoQuerVer', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Observações sobre identidade visual">
              <Textarea rows={2} value={form.observacoesIdentidade ?? ''} onChange={(e) => set('observacoesIdentidade', e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      {/* SEÇÃO 4 */}
      <div>
        <SectionTitle n={4}>Materiais disponíveis</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <YesNo label="Logo enviada?" value={form.logoEnviada} onChange={(v) => set('logoEnviada', v)} />
          <div className="grid grid-cols-2 gap-3">
            <YesNo
              label="Fotos antes/depois disponíveis?"
              value={form.fotosAntesDepois}
              onChange={(v) => set('fotosAntesDepois', v)}
            />
            <Field label="Se sim, quantas?">
              <Input
                value={form.fotosAntesDepoisQtd ?? ''}
                onChange={(e) => set('fotosAntesDepoisQtd', e.target.value)}
                disabled={form.fotosAntesDepois !== true}
                placeholder="Ex: 15"
              />
            </Field>
          </div>
          <YesNo label="Vídeos disponíveis?" value={form.videosDisponiveis} onChange={(v) => set('videosDisponiveis', v)} />
          <YesNo label="Depoimentos de clientes?" value={form.depoimentosClientes} onChange={(v) => set('depoimentosClientes', v)} />
          <YesNo label="Foto da equipe disponível?" value={form.fotoEquipe} onChange={(v) => set('fotoEquipe', v)} />
          <Field label="Link da pasta Drive com materiais">
            <Input
              value={form.linkDriveMateriais ?? ''}
              onChange={(e) => set('linkDriveMateriais', e.target.value)}
              placeholder="https://drive.google.com/..."
            />
          </Field>
        </div>
      </div>

      {/* SEÇÃO 5 */}
      <div>
        <SectionTitle n={5}>Processo de aprovação</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Canal de aprovação">
            <Select value={form.canalAprovacao ?? ''} onChange={(e) => set('canalAprovacao', (e.target.value || undefined) as ApprovalChannel)}>
              <option value="">Selecione...</option>
              {(Object.entries(APPROVAL_CHANNEL_LABEL) as [ApprovalChannel, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Prazo máximo para aprovação de conteúdo">
            <Input value={form.prazoAprovacao ?? ''} onChange={(e) => set('prazoAprovacao', e.target.value)} placeholder="Ex: 2 dias úteis" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Responsável pela aprovação no cliente (nome e contato)">
              <Input
                value={form.responsavelAprovacao ?? ''}
                onChange={(e) => set('responsavelAprovacao', e.target.value)}
                placeholder="Ex: Maria — (11) 99999-0000"
              />
            </Field>
          </div>
        </div>
      </div>

      {/* SEÇÃO 6 */}
      <div>
        <SectionTitle n={6}>Observações gerais</SectionTitle>
        <Textarea rows={4} value={form.observacoesGerais ?? ''} onChange={(e) => set('observacoesGerais', e.target.value)} />
      </div>

      <Button icon={<Save size={14} />} onClick={handleSave} loading={saving} className="self-start">
        Salvar briefing
      </Button>
    </div>
  )
}
