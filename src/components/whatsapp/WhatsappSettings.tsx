import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { BellRing, Bot, ChevronDown, Copy, Link2, Maximize2, Plus, RefreshCw, ShoppingCart, Timer, Trash2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { useAuth } from '../../context/AuthContext'
import { listenWaSettings, saveWaCredentials, saveWaSettings } from '../../services/whatsappService'
import { TemplatePickerField } from './WaTemplatePicker'
import { WA_CART_PARAM_LABEL, type WaCartParam, type WaFollowUpStep, type WaSettings, type WaStatus, type WaTemplate } from '../../types/whatsapp'

/* ------------------------------ peças ------------------------------ */

function Badge({ on, onText = 'Ligado', offText = 'Desligado' }: { on: boolean; onText?: string; offText?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${on ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-100 text-slate-500'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />
      {on ? onText : offText}
    </span>
  )
}

function Card({ icon, tone, title, description, badge, children }: { icon: ReactNode; tone: string; title: string; description?: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white" aria-label={title}>
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`} aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
          {description && <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{description}</p>}
        </div>
        {badge}
      </div>
      <div className="flex flex-col gap-4 p-5">{children}</div>
    </section>
  )
}

/** Linha com texto à esquerda e chave liga/desliga à direita. */
function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} aria-hidden="true" />
      </button>
    </div>
  )
}

function CopyLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">{value}</code>
        <Button
          variant="secondary"
          aria-label={`Copiar ${label}`}
          icon={<Copy size={15} aria-hidden="true" />}
          onClick={() => navigator.clipboard.writeText(value).then(() => toast.success(`${label} copiado`))}
        />
      </div>
    </div>
  )
}

/** Instruções da IA: caixa grande que cresce com o texto + botão de tela cheia pra ler e editar com calma. */
function InstructionsBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [full, setFull] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight + 2, 260), 640)}px`
  }, [value, full])
  const words = value.trim() ? value.trim().split(/\s+/).length : 0
  const box = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] leading-7 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100'
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <span className="block text-sm font-semibold text-slate-700" id="ai-instr-label">
            Instruções extras para a IA
          </span>
          <span className="block text-xs text-slate-400">Têm prioridade sobre o resto. Use uma regra por linha.</span>
        </div>
        <Button variant="secondary" size="sm" icon={<Maximize2 size={14} aria-hidden="true" />} onClick={() => setFull(true)}>
          Tela cheia
        </Button>
      </div>
      <textarea
        ref={ref}
        aria-labelledby="ai-instr-label"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={'Ex.:\n- Não fale de preço antes da reunião.\n- Se perguntarem de site, diga que o foco é anúncio.'}
        className={`${box} resize-y overflow-y-auto`}
        spellCheck
      />
      <p className="mt-1 text-right text-[11px] text-slate-400" aria-live="polite">
        {words} palavra{words === 1 ? '' : 's'} · {value.length} caracteres
      </p>
      <Modal open={full} onClose={() => setFull(false)} title="Instruções extras para a IA" width="max-w-5xl">
        <div className="flex flex-col gap-3">
          <textarea
            aria-label="Instruções extras para a IA"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
            className={`${box} h-[62vh] resize-none text-[16px] leading-8 sm:px-6 sm:py-5`}
            spellCheck
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-400">
              {words} palavras · as mudanças valem depois de clicar em "Salvar configurações".
            </span>
            <Button onClick={() => setFull(false)}>Pronto</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function TemplateSelect({ templates, name, lang, onChange, label }: { templates: WaTemplate[]; name: string; lang: string; onChange: (name: string, lang: string) => void; label: string }) {
  const value = name ? `${name}|${lang || 'pt_BR'}` : ''
  return <TemplatePickerField label={label} templates={templates} value={value} allowNone noneLabel="Tirar" onChange={(t) => onChange(t?.name || '', t?.language || 'pt_BR')} />
}

/* ------------------------------ conexão ------------------------------ */

const QUALITY: Record<string, string> = { GREEN: 'Alta', YELLOW: 'Média', RED: 'Baixa', UNKNOWN: 'Sem nota ainda' }

function ConnectionCard({ status, onSaved }: { status: WaStatus | null; onSaved: () => void }) {
  const [form, setForm] = useState({ token: '', appSecret: '', phoneNumberId: '', wabaId: '' })
  const [saving, setSaving] = useState(false)
  const connected = Boolean(status?.connected)

  useEffect(() => {
    if (status) setForm((f) => ({ ...f, phoneNumberId: f.phoneNumberId || status.phoneNumberId, wabaId: f.wabaId || status.wabaId }))
  }, [status])

  const save = async () => {
    setSaving(true)
    try {
      const out = await saveWaCredentials(form)
      toast.success(`Conectado: ${out.verifiedName || ''} ${out.displayPhone || ''}`.trim())
      setForm((f) => ({ ...f, token: '', appSecret: '' }))
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const credentialsForm = (
        <>
      <details className="group rounded-xl border border-slate-200 bg-slate-50">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-slate-700">
          Como conseguir esses dados
          <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ol className="list-decimal space-y-1.5 px-4 pb-4 pl-9 text-sm leading-relaxed text-slate-600">
          <li>Em developers.facebook.com, crie um app do tipo Empresa e adicione o produto WhatsApp.</li>
          <li>Em WhatsApp, Configuração da API, adicione o número da Arrow Shot e copie o ID do número de telefone e o ID da conta do WhatsApp Business.</li>
          <li>No Gerenciador de Negócios, em Usuários do sistema, crie um usuário administrador, dê acesso ao app e à conta do WhatsApp e gere um token sem validade com as permissões whatsapp_business_messaging e whatsapp_business_management.</li>
          <li>No app, em Configurações, Básico, copie a Chave secreta do aplicativo.</li>
          <li>Cole tudo aqui embaixo e clique em Conectar.</li>
          <li>Em WhatsApp, Configuração, Webhook, cole a URL e o token de verificação mostrados embaixo, salve e assine os campos messages e smb_message_echoes (este último faz o que a equipe manda pelo celular aparecer no CRM).</li>
        </ol>
      </details>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={connected ? 'Token (vazio mantém o atual)' : 'Token do usuário do sistema'} required={!connected}>
          <Input type="password" autoComplete="new-password" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
        </Field>
        <Field label={status?.hasAppSecret ? 'Chave secreta do app (vazio mantém a atual)' : 'Chave secreta do app'}>
          <Input type="password" autoComplete="new-password" value={form.appSecret} onChange={(e) => setForm({ ...form, appSecret: e.target.value })} />
        </Field>
        <Field label="ID do número de telefone" required>
          <Input inputMode="numeric" value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} />
        </Field>
        <Field label="ID da conta do WhatsApp Business (WABA)" required>
          <Input inputMode="numeric" value={form.wabaId} onChange={(e) => setForm({ ...form, wabaId: e.target.value })} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>
          {connected ? 'Salvar e testar' : 'Conectar'}
        </Button>
      </div>
        </>
  )

  return (
    <Card
      icon={<Link2 size={19} />}
      tone="bg-emerald-500/15 text-emerald-400"
      title="Conexão com o Meta"
      description={
        connected
          ? `${status?.verifiedName ? `${status.verifiedName}, ` : ''}${status?.displayPhone}. ${status?.lastWebhookAt ? `Última mensagem recebida do Meta em ${new Date(status.lastWebhookAt).toLocaleString('pt-BR')}.` : 'O Meta ainda não mandou nenhuma mensagem para o CRM.'}`
          : 'Ligue o número da Arrow Shot pela API oficial do WhatsApp.'
      }
      badge={<Badge on={connected} onText="Conectado" offText="Não conectado" />}
    >
      {connected && (
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-3">
            <dt className="text-xs text-slate-500">Número</dt>
            <dd className="mt-0.5 text-sm font-semibold text-slate-800">{status?.displayPhone || '—'}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <dt className="text-xs text-slate-500">Qualidade no Meta</dt>
            <dd className="mt-0.5 text-sm font-semibold text-slate-800">{QUALITY[status?.qualityRating || ''] || 'Sem nota ainda'}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <dt className="text-xs text-slate-500">Recebendo mensagens</dt>
            <dd className={`mt-0.5 text-sm font-semibold ${status?.lastWebhookAt ? 'text-emerald-400' : 'text-amber-400'}`}>{status?.lastWebhookAt ? 'Sim' : 'Ainda não testado'}</dd>
          </div>
        </dl>
      )}
      {connected && !status?.lastWebhookAt && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-300" role="status">
          Mande um "oi" de outro celular para {status?.displayPhone}. Se a conversa não aparecer em Conversas em 1 minuto, confira o passo 6 do guia (webhook) com a URL e o token abaixo.
        </p>
      )}
      {connected ? (
        <details className="group rounded-xl border border-slate-200">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-slate-700">
            Trocar token ou IDs da conexão
            <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="flex flex-col gap-4 px-4 pb-4">{credentialsForm}</div>
        </details>
      ) : (
        credentialsForm
      )}
      {status && (
        <div className="grid gap-3 rounded-xl border border-dashed border-slate-200 p-4 md:grid-cols-2">
          <p className="text-xs text-slate-500 md:col-span-2">Dados do webhook, para colar no app do Meta (WhatsApp, Configuração).</p>
          <CopyLine label="URL do webhook" value={status.webhookUrl} />
          <CopyLine label="Token de verificação" value={status.verifyToken} />
        </div>
      )}
    </Card>
  )
}

/* ------------------------------ follow-up ------------------------------ */

function StepRow({ step, i, templates, freeOnly, onChange, onRemove }: { step: WaFollowUpStep; i: number; templates: WaTemplate[]; freeOnly: boolean; onChange: (s: WaFollowUpStep) => void; onRemove: () => void }) {
  return (
    <li className="group relative flex gap-3 pb-5 last:pb-0">
      <span className="absolute left-[13px] top-8 bottom-0 w-px bg-slate-200 group-last:hidden" aria-hidden="true" />
      <span className="relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white" aria-hidden="true">
        {i + 1}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <h3 className="sr-only">Passo {i + 1}</h3>
          <span>Depois de</span>
          <label>
            <span className="sr-only">Horas sem resposta antes do passo {i + 1}</span>
            <input
              type="number"
              min={1}
              max={freeOnly ? 23 : 720}
              value={step.afterHours}
              onChange={(e) => onChange({ ...step, afterHours: Number(e.target.value) || 1 })}
              className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm font-semibold text-slate-800"
            />
          </label>
          <span>{i === 0 ? 'horas sem resposta' : 'horas depois do anterior'}</span>
          <button type="button" className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label={`Remover passo ${i + 1}`} onClick={onRemove}>
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
        <div className={`grid gap-3 ${freeOnly ? '' : 'md:grid-cols-2'}`}>
          <Field label="Mensagem" hint="Vazio = a IA escreve, retomando a conversa.">
            <Textarea rows={2} value={step.text} placeholder="Ou escreva. {nome} = primeiro nome." onChange={(e) => onChange({ ...step, text: e.target.value })} />
          </Field>
          {!freeOnly && <TemplateSelect label="Modelo depois de 24h" templates={templates} name={step.templateName} lang={step.templateLang} onChange={(n, l) => onChange({ ...step, templateName: n, templateLang: l })} />}
        </div>
      </div>
    </li>
  )
}

/* ------------------------------ configurações ------------------------------ */

type SettingsTab = 'ia' | 'followup' | 'lembrete' | 'carrinho' | 'conexao'

/** Grupo de campos dentro de uma aba, com título pequeno. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</legend>
      {children}
    </fieldset>
  )
}

export function WhatsappSettings({ status, templates, onReloadStatus, onReloadTemplates }: { status: WaStatus | null; templates: WaTemplate[]; onReloadStatus: () => void; onReloadTemplates: () => void }) {
  const { profile } = useAuth()
  const [s, setS] = useState<WaSettings | null>(null)
  const [dirty, setDirtyState] = useState(false)
  const dirtyRef = useRef(false)
  const setDirty = (v: boolean) => {
    dirtyRef.current = v
    setDirtyState(v)
  }
  const [saving, setSaving] = useState(false)

  // Mudança salva por outra pessoa entra na hora, menos quando há edição não salva aqui.
  useEffect(() => listenWaSettings((next) => setS((cur) => (cur && dirtyRef.current ? cur : next))), [])

  const edit = (fn: (cur: WaSettings) => WaSettings) => {
    setS((cur) => (cur ? fn(cur) : cur))
    setDirty(true)
  }
  const editStep = (i: number, step: WaFollowUpStep) => edit((c) => ({ ...c, followUp: { ...c.followUp, steps: c.followUp.steps.map((x, j) => (j === i ? step : x)) } }))

  const save = async () => {
    if (!s || !profile) return
    setSaving(true)
    try {
      await saveWaSettings(s, profile.id)
      setDirty(false)
      toast.success('Configurações do WhatsApp salvas')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const [tab, setTab] = useState<SettingsTab>('ia')

  const cartTpl = s ? templates.find((t) => t.name === s.cart.templateName && t.language === s.cart.templateLang) : undefined

  const TABS: { id: SettingsTab; label: string; on: boolean | null }[] = [
    { id: 'ia', label: 'IA', on: s ? s.aiEnabled : null },
    { id: 'followup', label: 'Follow-up', on: s ? s.followUp.enabled : null },
    { id: 'lembrete', label: 'Lembrete', on: s ? s.reminder.enabled : null },
    { id: 'carrinho', label: 'Carrinho', on: s ? s.cart.enabled : null },
    { id: 'conexao', label: 'Conexão', on: Boolean(status?.connected) },
  ]

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div role="tablist" aria-label="Partes das configurações" className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 [scrollbar-width:none]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex h-8 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition ${tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t.on !== null && <span className={`h-1.5 w-1.5 rounded-full ${t.on ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />}
            {t.label}
            {t.on !== null && <span className="sr-only">{t.on ? ', ligado' : ', desligado'}</span>}
          </button>
        ))}
      </div>

      {tab === 'conexao' && <ConnectionCard status={status} onSaved={() => (onReloadStatus(), onReloadTemplates())} />}
      {tab !== 'conexao' && !s && <p className="py-8 text-center text-sm text-slate-400">Carregando…</p>}

      {s && tab !== 'conexao' && (
        <>
          {tab === 'ia' && (
            <>
            <Card icon={<Bot size={19} />} tone="bg-violet-500/15 text-violet-400" title="IA de atendimento (SDR)" description="Responde quem chama, entende o negócio e marca a reunião. Passa pra equipe quando pedem uma pessoa, reclamam ou querem negociar." badge={<Badge on={s.aiEnabled} />}>
              <Toggle checked={s.aiEnabled} onChange={(v) => edit((c) => ({ ...c, aiEnabled: v }))} label="IA responde as conversas" hint="Dá pra desligar em cada conversa também." />
  
              <Group title="Quem a IA atende">
                <p className="text-sm text-slate-500">Número novo: na primeira resposta a IA pergunta se a pessoa já é cliente ou já falou com o Bruno. Se for, passa pro Bruno.</p>
                <Toggle checked={s.skipKnownContacts !== false} onChange={(v) => edit((c) => ({ ...c, skipKnownContacts: v }))} label="Não atender quem já é cliente ou já fala com a equipe" hint="Cliente, ex-cliente ou lead antigo/em andamento: a IA fica quieta e avisa vocês." />
              </Group>
  
              <Group title="Reunião">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nome da IA" hint="Como ela se apresenta. Vazio = sem nome.">
                    <Input value={s.sdr.name} onChange={(e) => edit((c) => ({ ...c, sdr: { ...c.sdr, name: e.target.value } }))} placeholder="Ex.: Jonas" />
                  </Field>
                  <Field label="Reunião com">
                    <Input value={s.sdr.meetingWith} onChange={(e) => edit((c) => ({ ...c, sdr: { ...c.sdr, meetingWith: e.target.value } }))} placeholder="Bruno" />
                  </Field>
                  <Field label="Duração">
                    <Input value={s.sdr.meetingLength} onChange={(e) => edit((c) => ({ ...c, sdr: { ...c.sdr, meetingLength: e.target.value } }))} placeholder="30 minutos" />
                  </Field>
                  <Field label="Horários para propor">
                    <Input value={s.sdr.meetingHours} onChange={(e) => edit((c) => ({ ...c, sdr: { ...c.sdr, meetingHours: e.target.value } }))} placeholder="segunda a sexta, das 9h às 18h" />
                  </Field>
                </div>
                <Field label="Link da agenda" hint="Vazio = a IA propõe 2 horários.">
                  <Input value={s.sdr.meetingLink} onChange={(e) => edit((c) => ({ ...c, sdr: { ...c.sdr, meetingLink: e.target.value.trim() } }))} placeholder="https://" inputMode="url" />
                </Field>
              </Group>
  
              <InstructionsBox value={s.aiInstructions} onChange={(v) => edit((c) => ({ ...c, aiInstructions: v }))} />
  
              <details className="group rounded-xl border border-slate-200">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-slate-700">
                  Avançado
                  <ChevronDown size={16} className="text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="flex flex-col gap-4 px-4 pb-4">
                  <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <span>Esperar</span>
                    <input
                      type="number"
                      min={5}
                      max={90}
                      value={s.aiDelaySeconds}
                      onChange={(e) => edit((c) => ({ ...c, aiDelaySeconds: Number(e.target.value) || 25 }))}
                      className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm font-semibold text-slate-800"
                    />
                    <span>segundos antes de responder</span>
                    <span className="block w-full text-[11px] text-slate-400">Se o contato mandar outra mensagem nesse tempo, a IA responde tudo junto.</span>
                  </label>
                  <Toggle checked={s.autoCreateLead} onChange={(v) => edit((c) => ({ ...c, autoCreateLead: v }))} label="Criar lead quando um número novo chamar" hint="Entra em Novo Lead." />
                  <Toggle checked={s.notifyEveryMessage} onChange={(v) => edit((c) => ({ ...c, notifyEveryMessage: v }))} label="Avisar no celular a cada mensagem" hint="Só nas conversas sem IA. Desligado: só avisa o importante." />
                </div>
              </details>
            </Card>
            </>
          )}
          {tab === 'followup' && (
            <>
            <Card
              icon={<Timer size={19} />}
              tone="bg-sky-500/15 text-sky-400"
              title="Follow-up automático"
              description="Para quem parou de responder. Para sozinho se a pessoa responder, marcar reunião, a equipe assumir ou fechar 24h sem resposta."
              badge={<Badge on={s.followUp.enabled} />}
            >
              <Toggle checked={s.followUp.enabled} onChange={(v) => edit((c) => ({ ...c, followUp: { ...c.followUp, enabled: v } }))} label="Follow-up ligado" />
              <Toggle
                checked={s.followUp.freeOnly !== false}
                onChange={(v) => edit((c) => ({ ...c, followUp: { ...c.followUp, freeOnly: v } }))}
                label="Só dentro das 24h (sem custo)"
                hint="Só manda texto até 24h depois da última mensagem do contato. Depois disso o WhatsApp cobra por mensagem de modelo, então o follow-up para."
              />
              <Toggle checked={s.followUp.businessHoursOnly} onChange={(v) => edit((c) => ({ ...c, followUp: { ...c.followUp, businessHoursOnly: v } }))} label="Só em horário comercial" hint="Segunda a sábado, das 8h às 20h." />
              <ol className="mt-1 flex flex-col" aria-label="Passos do follow-up">
                {s.followUp.steps.map((step, i) => (
                  <StepRow
                    key={i}
                    step={step}
                    i={i}
                    templates={templates}
                    freeOnly={s.followUp.freeOnly !== false}
                    onChange={(next) => editStep(i, next)}
                    onRemove={() => edit((c) => ({ ...c, followUp: { ...c.followUp, steps: c.followUp.steps.filter((_, j) => j !== i) } }))}
                  />
                ))}
              </ol>
              {s.followUp.freeOnly !== false && (() => {
                const total = s.followUp.steps.reduce((a, x) => a + (Number(x.afterHours) || 0), 0)
                return total >= 23 ? (
                  <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-500" role="status">
                    Os passos somam {total}h. O que passar de 23h não sai: se a janela for fechar antes, o próximo passo é mandado antes de fechar.
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">Os passos somam {total}h, dentro da janela grátis. Se a janela for fechar antes de um passo, ele sai antes de fechar.</p>
                )
              })()}
              {s.followUp.steps.length < 5 && (
                <div>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Plus size={14} aria-hidden="true" />}
                    onClick={() => edit((c) => ({ ...c, followUp: { ...c.followUp, steps: [...c.followUp.steps, { afterHours: c.followUp.freeOnly !== false ? 4 : 48, text: '', templateName: '', templateLang: 'pt_BR' }] } }))}
                  >
                    Adicionar passo
                  </Button>
                </div>
              )}
            </Card>
            </>
          )}
          {tab === 'lembrete' && (
            <>
            <Card
              icon={<BellRing size={19} />}
              tone="bg-emerald-500/15 text-emerald-400"
              title="Lembrete da reunião"
              description="Quando a IA marca dia e hora, o contato recebe uma mensagem pouco antes (pode variar uns 5 minutos)."
              badge={<Badge on={s.reminder.enabled} />}
            >
              <Toggle checked={s.reminder.enabled} onChange={(v) => edit((c) => ({ ...c, reminder: { ...c.reminder, enabled: v } }))} label="Mandar lembrete antes da reunião" />
              <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span>Mandar</span>
                <input
                  type="number"
                  min={10}
                  max={1440}
                  value={s.reminder.minutesBefore}
                  onChange={(e) => edit((c) => ({ ...c, reminder: { ...c.reminder, minutesBefore: Number(e.target.value) || 30 } }))}
                  className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm font-semibold text-slate-800"
                />
                <span>minutos antes da reunião</span>
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Texto (dentro de 24h)" hint="Use {nome}, {quando} (ex.: hoje às 9h), {hora} e {com}.">
                  <Textarea
                    rows={3}
                    value={s.reminder.text}
                    placeholder="Oi {nome}, passando pra lembrar da nossa reunião {quando} com o {com}. Até já!"
                    onChange={(e) => edit((c) => ({ ...c, reminder: { ...c.reminder, text: e.target.value } }))}
                  />
                </Field>
                <TemplateSelect
                  label="Modelo (depois de 24h): {{1}} = nome, {{2}} = quando"
                  templates={templates}
                  name={s.reminder.templateName}
                  lang={s.reminder.templateLang}
                  onChange={(n, l) => edit((c) => ({ ...c, reminder: { ...c.reminder, templateName: n, templateLang: l } }))}
                />
              </div>
            </Card>
            </>
          )}
          {tab === 'carrinho' && (
            <>
            <Card
              icon={<ShoppingCart size={19} />}
              tone="bg-amber-500/15 text-amber-400"
              title="Carrinho abandonado da Loja"
              description="Quem põe o telefone no checkout e não paga recebe um modelo. Se responder, a IA atende sobre o produto."
              badge={<Badge on={s.cart.enabled && Boolean(s.cart.templateName)} offText={s.cart.enabled ? 'Falta o modelo' : 'Desligado'} />}
            >
              <Toggle checked={s.cart.enabled} onChange={(v) => edit((c) => ({ ...c, cart: { ...c.cart, enabled: v } }))} label="Mandar WhatsApp para carrinho abandonado" hint="Só nos produtos que pedem telefone no checkout. Produtos privados ficam de fora." />
              <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                <Field label="Minutos parado antes de mandar">
                  <Input type="number" min={15} max={1440} value={s.cart.afterMinutes} onChange={(e) => edit((c) => ({ ...c, cart: { ...c.cart, afterMinutes: Number(e.target.value) || 40 } }))} />
                </Field>
                <TemplateSelect label="Modelo" templates={templates} name={s.cart.templateName} lang={s.cart.templateLang} onChange={(n, l) => edit((c) => ({ ...c, cart: { ...c.cart, templateName: n, templateLang: l } }))} />
              </div>
              {cartTpl && cartTpl.vars > 0 && (
                <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
                  <legend className="px-1 text-sm font-medium text-slate-700">O que vai em cada variável</legend>
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: cartTpl.vars }, (_, i) => (
                      <Field key={i} label={`Variável ${i + 1}`}>
                        <Select
                          value={s.cart.params[i] || ''}
                          onChange={(e) =>
                            edit((c) => {
                              const params = [...c.cart.params]
                              params[i] = e.target.value as WaCartParam
                              return { ...c, cart: { ...c.cart, params: params.slice(0, cartTpl.vars) } }
                            })
                          }
                        >
                          <option value="">Escolha</option>
                          {(Object.keys(WA_CART_PARAM_LABEL) as WaCartParam[]).map((k) => (
                            <option key={k} value={k}>
                              {WA_CART_PARAM_LABEL[k]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ))}
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-slate-500">Texto do modelo</span>
                    <p className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-600 px-3 py-2 text-sm text-white">{cartTpl.body}</p>
                  </div>
                </fieldset>
              )}
            </Card>
            </>
          )}

          <div className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 sticky bottom-3 z-10 ${dirty ? 'border-amber-500/40 bg-white shadow-lg' : 'border-slate-200 bg-white'}`}>
            <span className={`flex items-center gap-2 text-sm ${dirty ? 'text-amber-600' : 'text-slate-500'}`} role="status">
              <span className={`h-2 w-2 rounded-full ${dirty ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden="true" />
              {dirty ? 'Alterações não salvas' : 'Tudo salvo'}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button variant="ghost" icon={<RefreshCw size={15} aria-hidden="true" />} onClick={onReloadTemplates}>
                Atualizar modelos
              </Button>
              <Button onClick={save} loading={saving} disabled={!dirty}>
                Salvar configurações
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
