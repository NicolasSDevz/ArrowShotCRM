import { useEffect, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { useAuth } from '../../context/AuthContext'
import { updateClient } from '../../services/clientService'
import { markBriefingChecklistDone } from '../../services/taskService'
import { notifyAdminsOfAction } from '../../services/notificationService'
import {
  APPROVAL_CHANNEL_LABEL,
  BRIEFING_TONE_OF_VOICE_LABEL,
  type ApprovalChannel,
  type BriefingToneOfVoice,
  type Client,
  type ClientAudience,
  type ClientBriefing,
} from '../../types/client'
import { BriefingProgress, Checkbox, OldAnswers, SaveBar, SectionTitle, useUnsavedWarning } from './briefingUi'

const EMPTY: ClientBriefing = {}

const AUDIENCE_OPTIONS: [ClientAudience, string][] = [
  ['residencial', 'Residencial (casas e apartamentos)'],
  ['comercial', 'Comercial (empresas e condomínios)'],
  ['ambos', 'Os dois'],
]

const filled = (v: unknown) => (typeof v === 'string' ? v.trim() !== '' : v != null)

export function ClientBriefingPanel({ client }: { client: Client }) {
  const { profile } = useAuth()
  const initial = client.briefing ?? EMPTY
  const [form, setForm] = useState<ClientBriefing>(initial)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState('')
  useUnsavedWarning(dirty)

  // Resync só ao trocar de cliente, não a cada snapshot de `clients`.
  useEffect(() => {
    setForm(client.briefing ?? EMPTY)
    setDirty(false)
    setResult('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id])

  const set = <K extends keyof ClientBriefing>(key: K, value: ClientBriefing[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setDirty(true)
  }

  // "Atende B2B?" deixou de ser pergunta: sai da resposta de "Atende".
  const atendeEmpresas = form.atendeTipo ? form.atendeTipo !== 'residencial' : form.atendeB2B === true

  const questions: [string, boolean][] = [
    ['serviços oferecidos', filled(form.servicos)],
    ['quem atende', filled(form.atendeTipo)],
    ['diferencial', filled(form.diferencial)],
    ['dor principal do cliente', filled(form.dorPrincipal)],
    ['tom de voz', filled(form.tomVoz)],
    ['cores da marca', filled(form.coresMarca)],
    ['link da pasta de materiais', filled(form.linkDriveMateriais)],
    ['canal de aprovação', filled(form.canalAprovacao)],
    ['quem aprova no cliente', filled(form.responsavelAprovacao)],
  ]
  const missing = questions.filter(([, ok]) => !ok).map(([n]) => n)

  const handleSave = async () => {
    if (!profile) return
    setSaving(true)
    try {
      const payload: ClientBriefing = {
        ...form,
        atendeB2B: form.atendeTipo ? form.atendeTipo !== 'residencial' : form.atendeB2B,
        preenchidoPor: profile.name,
        filledAt: Timestamp.now(),
      }
      if (payload.atendeB2B === undefined) delete payload.atendeB2B
      const first = !client.briefing?.filledAt
      await updateClient(client.id, { briefing: payload }, profile.id, profile.name)
      await markBriefingChecklistDone(client.id, profile.id, profile.name)
      await notifyAdminsOfAction({
        type: 'briefing_filled',
        message: `${client.companyName}: ${profile.name} ${first ? 'preencheu' : 'atualizou'} o briefing de Social Mídia`,
        actorId: profile.id,
        actorName: profile.name,
        entityType: 'client',
        entityId: client.id,
      })
      setDirty(false)
      setResult(`Briefing de Social Mídia de ${client.companyName} salvo.`)
    } catch (err) {
      console.error(err)
      setResult('Erro ao salvar o briefing. Tente de novo.')
      toast.error('Erro ao salvar briefing')
    } finally {
      setSaving(false)
    }
  }

  const lastFilled = client.briefing?.filledAt
  const lastSaved = lastFilled
    ? `Salvo por último por ${client.briefing?.preenchidoPor} em ${format(lastFilled.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.`
    : 'Ainda não foi salvo.'

  const oldNaoAssociar = filled(initial.naoAssociar)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-slate-600">
          Preencher na reunião de onboarding. Empresa, WhatsApp, cidade e pacote já ficam no cadastro do cliente. Nada é
          obrigatório. {lastSaved}
        </p>
        <BriefingProgress answered={questions.length - missing.length} missing={missing} />
      </div>

      <section>
        <SectionTitle>1. A empresa</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Há quanto tempo está no mercado">
            <Input value={form.tempoMercado ?? ''} onChange={(e) => set('tempoMercado', e.target.value)} placeholder="Ex: 5 anos" />
          </Field>
          <Field label="Quantos serviços já entregou, mais ou menos">
            <Input value={form.numeroObras ?? ''} onChange={(e) => set('numeroObras', e.target.value)} placeholder="Ex: mais de 200" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Principais serviços oferecidos">
              <Textarea rows={2} value={form.servicos ?? ''} onChange={(e) => set('servicos', e.target.value)} />
            </Field>
          </div>
          <Field label="Ticket médio do serviço">
            <Input value={form.ticketMedio ?? ''} onChange={(e) => set('ticketMedio', e.target.value)} placeholder="Ex: R$ 1.500" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Principal diferencial da empresa">
              <Textarea rows={2} value={form.diferencial ?? ''} onChange={(e) => set('diferencial', e.target.value)} />
            </Field>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>2. Público</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="A empresa atende quem?">
            <Select value={form.atendeTipo ?? ''} onChange={(e) => set('atendeTipo', (e.target.value || undefined) as ClientAudience | undefined)}>
              <option value="">Não respondido</option>
              {AUDIENCE_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          {atendeEmpresas && (
            <Field label="Que tipo de empresa atende">
              <Input value={form.setorB2B ?? ''} onChange={(e) => set('setorB2B', e.target.value)} placeholder="Ex: condomínios, construtoras" />
            </Field>
          )}
          <div className="sm:col-span-2">
            <Field label="Como é o cliente ideal">
              <Textarea rows={2} value={form.clienteIdeal ?? ''} onChange={(e) => set('clienteIdeal', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Dor principal do cliente antes de contratar">
              <Textarea rows={2} value={form.dorPrincipal ?? ''} onChange={(e) => set('dorPrincipal', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Objeção mais comum na venda">
              <Textarea rows={2} value={form.objecaoComum ?? ''} onChange={(e) => set('objecaoComum', e.target.value)} />
            </Field>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>3. Marca e tom de voz</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tom de voz">
            <Select value={form.tomVoz ?? ''} onChange={(e) => set('tomVoz', e.target.value || undefined)}>
              <option value="">Não respondido</option>
              {(Object.entries(BRIEFING_TONE_OF_VOICE_LABEL) as [BriefingToneOfVoice, string][]).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cores da marca">
            <Input value={form.coresMarca ?? ''} onChange={(e) => set('coresMarca', e.target.value)} placeholder="Ex: azul-marinho e branco" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Perfil do Instagram que admira">
              <Input value={form.referenciaPerfil ?? ''} onChange={(e) => set('referenciaPerfil', e.target.value)} placeholder="Ex: @perfil" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="O que não quer ver nos posts nem associado à marca">
              <Textarea rows={2} value={form.naoQuerVer ?? ''} onChange={(e) => set('naoQuerVer', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Observações sobre identidade visual">
              <Textarea rows={2} value={form.observacoesIdentidade ?? ''} onChange={(e) => set('observacoesIdentidade', e.target.value)} />
            </Field>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>4. Materiais</SectionTitle>
        <fieldset>
          <legend className="mb-2 text-sm text-slate-600">Marque o que o cliente já mandou ou tem para mandar</legend>
          <div className="flex flex-col gap-2">
            <Checkbox label="Logo" checked={form.logoEnviada === true} onChange={(v) => set('logoEnviada', v)} />
            <Checkbox label="Fotos de antes e depois" checked={form.fotosAntesDepois === true} onChange={(v) => set('fotosAntesDepois', v)} />
            {form.fotosAntesDepois && (
              <div className="ml-6 max-w-xs">
                <Field label="Quantas fotos de antes e depois">
                  <Input value={form.fotosAntesDepoisQtd ?? ''} onChange={(e) => set('fotosAntesDepoisQtd', e.target.value)} placeholder="Ex: 15" />
                </Field>
              </div>
            )}
            <Checkbox label="Vídeos" checked={form.videosDisponiveis === true} onChange={(v) => set('videosDisponiveis', v)} />
            <Checkbox label="Depoimentos de clientes" checked={form.depoimentosClientes === true} onChange={(v) => set('depoimentosClientes', v)} />
            <Checkbox label="Foto da equipe" checked={form.fotoEquipe === true} onChange={(v) => set('fotoEquipe', v)} />
          </div>
        </fieldset>
        <div className="mt-3">
          <Field label="Link da pasta do Drive com os materiais">
            <Input
              type="url"
              value={form.linkDriveMateriais ?? ''}
              onChange={(e) => set('linkDriveMateriais', e.target.value)}
              placeholder="https://drive.google.com/..."
            />
          </Field>
        </div>
      </section>

      <section>
        <SectionTitle>5. Aprovação dos posts</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Por onde o cliente aprova">
            <Select
              value={form.canalAprovacao ?? ''}
              onChange={(e) => set('canalAprovacao', (e.target.value || undefined) as ApprovalChannel | undefined)}
            >
              <option value="">Não respondido</option>
              {(Object.entries(APPROVAL_CHANNEL_LABEL) as [ApprovalChannel, string][]).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prazo para aprovar">
            <Input value={form.prazoAprovacao ?? ''} onChange={(e) => set('prazoAprovacao', e.target.value)} placeholder="Ex: 2 dias úteis" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Quem aprova no cliente: nome e WhatsApp">
              <Input
                value={form.responsavelAprovacao ?? ''}
                onChange={(e) => set('responsavelAprovacao', e.target.value)}
                placeholder="Ex: Maria, (11) 99999-0000"
              />
            </Field>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>6. Observações gerais</SectionTitle>
        <Field label="Observações gerais">
          <Textarea rows={4} value={form.observacoesGerais ?? ''} onChange={(e) => set('observacoesGerais', e.target.value)} />
        </Field>
      </section>

      <OldAnswers count={oldNaoAssociar ? 1 : 0}>
        <div className="sm:col-span-2">
          <Field label="O que não quer ser associado à marca">
            <Textarea rows={2} value={form.naoAssociar ?? ''} onChange={(e) => set('naoAssociar', e.target.value)} />
          </Field>
        </div>
      </OldAnswers>

      <SaveBar dirty={dirty} saving={saving} onSave={handleSave} savedMessage={result || lastSaved} />
    </div>
  )
}
