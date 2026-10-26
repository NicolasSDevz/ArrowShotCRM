import { useEffect, useRef, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { Bot, ChevronDown, Copy, Link2, Plus, RefreshCw, ShoppingCart, Timer, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { useAuth } from '../../context/AuthContext'
import { listenWaSettings, saveWaCredentials, saveWaSettings } from '../../services/whatsappService'
import { WA_CART_PARAM_LABEL, type WaCartParam, type WaFollowUpStep, type WaSettings, type WaStatus, type WaTemplate } from '../../types/whatsapp'

/* ------------------------------ peças ------------------------------ */

function Badge({ on, onText = 'Ligado', offText = 'Desligado' }: { on: boolean; onText?: string; offText?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />
      {on ? onText : offText}
    </span>
  )
}

function Card({ icon, tone, title, description, badge, children }: { icon: ReactNode; tone: string; title: string; description?: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white" aria-label={title}>
      <div className="flex items-start gap-3 border-b border-slate-100 p-5">
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

function TemplateSelect({ templates, name, lang, onChange, label }: { templates: WaTemplate[]; name: string; lang: string; onChange: (name: string, lang: string) => void; label: string }) {
  const approved = templates.filter((t) => t.status === 'APPROVED')
  const value = name ? `${name}|${lang || 'pt_BR'}` : ''
  return (
    <Field label={label}>
      <Select
        value={value}
        onChange={(e) => {
          const [n, l] = e.target.value.split('|')
          onChange(n || '', l || 'pt_BR')
        }}
      >
        <option value="">Nenhum</option>
        {name && !approved.some((t) => `${t.name}|${t.language}` === value) && <option value={value}>{name} (não aprovado ou não encontrado)</option>}
        {approved.map((t) => (
          <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
            {t.name} ({t.language}, {t.vars} variáveis)
          </option>
        ))}
      </Select>
    </Field>
  )
}

/* ------------------------------ conexão ------------------------------ */

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

  return (
    <Card
      icon={<Link2 size={19} />}
      tone="bg-emerald-50 text-emerald-600"
      title="Conexão com o Meta"
      description={
        connected
          ? `${status?.verifiedName ? `${status.verifiedName}, ` : ''}${status?.displayPhone}. ${status?.lastWebhookAt ? `Última mensagem recebida do Meta em ${new Date(status.lastWebhookAt).toLocaleString('pt-BR')}.` : 'O Meta ainda não mandou nenhuma mensagem para o CRM.'}`
          : 'Ligue o número da Arrow Shot pela API oficial do WhatsApp.'
      }
      badge={<Badge on={connected} onText="Conectado" offText="Não conectado" />}
    >
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
          <li>Em WhatsApp, Configuração, Webhook, cole a URL e o token de verificação mostrados no fim deste bloco, salve e assine o campo messages.</li>
        </ol>
      </details>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={connected ? 'Token (vazio mantém o atual)' : 'Token do usuário do sistema'} required={!connected}>
          <Input type="password" autoComplete="off" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
        </Field>
        <Field label={status?.hasAppSecret ? 'Chave secreta do app (vazio mantém a atual)' : 'Chave secreta do app'}>
          <Input type="password" autoComplete="off" value={form.appSecret} onChange={(e) => setForm({ ...form, appSecret: e.target.value })} />
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
      {status && (
        <div className="grid gap-3 rounded-xl border border-dashed border-slate-200 p-4 md:grid-cols-2">
          <CopyLine label="URL do webhook" value={status.webhookUrl} />
          <CopyLine label="Token de verificação" value={status.verifyToken} />
        </div>
      )}
    </Card>
  )
}

/* ------------------------------ follow-up ------------------------------ */

function StepRow({ step, i, templates, onChange, onRemove }: { step: WaFollowUpStep; i: number; templates: WaTemplate[]; onChange: (s: WaFollowUpStep) => void; onRemove: () => void }) {
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
              max={720}
              value={step.afterHours}
              onChange={(e) => onChange({ ...step, afterHours: Number(e.target.value) || 1 })}
              className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm font-semibold text-slate-800"
            />
          </label>
          <span>horas sem resposta</span>
          <button type="button" className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label={`Remover passo ${i + 1}`} onClick={onRemove}>
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Texto (dentro de 24h)">
            <Textarea rows={2} value={step.text} placeholder="Vazio: a IA escreve. Use {nome} para o primeiro nome." onChange={(e) => onChange({ ...step, text: e.target.value })} />
          </Field>
          <TemplateSelect label="Modelo (depois de 24h)" templates={templates} name={step.templateName} lang={step.templateLang} onChange={(n, l) => onChange({ ...step, templateName: n, templateLang: l })} />
        </div>
      </div>
    </li>
  )
}

/* ------------------------------ configurações ------------------------------ */

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

  const cartTpl = s ? templates.find((t) => t.name === s.cart.templateName && t.language === s.cart.templateLang) : undefined

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pb-24">
      <ConnectionCard status={status} onSaved={() => (onReloadStatus(), onReloadTemplates())} />

      {s && (
        <>
          <Card
            icon={<Bot size={19} />}
            tone="bg-violet-50 text-violet-600"
            title="IA no atendimento"
            description="Responde quem chama usando a Base de Vendas. Se a pessoa pede um humano, reclama ou quer fechar, a IA avisa a equipe e para de responder naquela conversa."
            badge={<Badge on={s.aiEnabled} />}
          >
            <Toggle checked={s.aiEnabled} onChange={(v) => edit((c) => ({ ...c, aiEnabled: v }))} label="IA responde as conversas" hint="Dá para desligar em cada conversa também." />
            <Toggle checked={s.autoCreateLead} onChange={(v) => edit((c) => ({ ...c, autoCreateLead: v }))} label="Criar lead quando um número novo chamar" hint="Entra em Novo Lead, com origem WhatsApp direto." />
            <Field label="Instruções extras para a IA">
              <Textarea rows={4} value={s.aiInstructions} onChange={(e) => edit((c) => ({ ...c, aiInstructions: e.target.value }))} placeholder="Ex.: sempre ofereça a reunião de diagnóstico gratuita; o Bruno atende das 9h às 18h; não fale de preço antes da reunião." />
            </Field>
          </Card>

          <Card
            icon={<Timer size={19} />}
            tone="bg-blue-50 text-blue-600"
            title="Follow-up automático"
            description="Quando o contato para de responder, cada passo sai depois do tempo marcado, contado da última mensagem nossa. Para sozinho se ele responder, se o lead for para Fechado ou Perdido, ou se a equipe assumir."
            badge={<Badge on={s.followUp.enabled} />}
          >
            <Toggle checked={s.followUp.enabled} onChange={(v) => edit((c) => ({ ...c, followUp: { ...c.followUp, enabled: v } }))} label="Follow-up ligado" />
            <Toggle checked={s.followUp.businessHoursOnly} onChange={(v) => edit((c) => ({ ...c, followUp: { ...c.followUp, businessHoursOnly: v } }))} label="Só em horário comercial" hint="Segunda a sábado, das 8h às 20h." />
            <ol className="mt-1 flex flex-col" aria-label="Passos do follow-up">
              {s.followUp.steps.map((step, i) => (
                <StepRow
                  key={i}
                  step={step}
                  i={i}
                  templates={templates}
                  onChange={(next) => editStep(i, next)}
                  onRemove={() => edit((c) => ({ ...c, followUp: { ...c.followUp, steps: c.followUp.steps.filter((_, j) => j !== i) } }))}
                />
              ))}
            </ol>
            {s.followUp.steps.length < 5 && (
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Plus size={14} aria-hidden="true" />}
                  onClick={() => edit((c) => ({ ...c, followUp: { ...c.followUp, steps: [...c.followUp.steps, { afterHours: 48, text: '', templateName: '', templateLang: 'pt_BR' }] } }))}
                >
                  Adicionar passo
                </Button>
              </div>
            )}
          </Card>

          <Card
            icon={<ShoppingCart size={19} />}
            tone="bg-amber-50 text-amber-600"
            title="Carrinho abandonado da Loja"
            description="Quem põe o telefone no checkout e não paga recebe uma mensagem de modelo. Se responder, a IA atende com as informações do produto. Os e-mails de recuperação continuam saindo."
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

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
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
