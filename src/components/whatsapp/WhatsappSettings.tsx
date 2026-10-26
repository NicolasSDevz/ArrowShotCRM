import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Copy, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { useAuth } from '../../context/AuthContext'
import { listenWaSettings, saveWaCredentials, saveWaSettings } from '../../services/whatsappService'
import { WA_CART_PARAM_LABEL, type WaCartParam, type WaSettings, type WaStatus, type WaTemplate } from '../../types/whatsapp'

function Card({ title, children, description }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4" aria-label={title}>
      <div>
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input type="checkbox" className="mt-0.5 h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </span>
    </label>
  )
}

function CopyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-end gap-2">
      <Field label={label}>
        <Input value={value} readOnly onFocus={(e) => e.target.select()} />
      </Field>
      <Button
        variant="secondary"
        aria-label={`Copiar ${label}`}
        icon={<Copy size={15} aria-hidden="true" />}
        onClick={() => navigator.clipboard.writeText(value).then(() => toast.success(`${label} copiado`))}
      />
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
      title="Conexão com o Meta"
      description={
        status?.connected
          ? `Conectado: ${status.verifiedName || 'número'} ${status.displayPhone}. ${status.lastWebhookAt ? `Último aviso do Meta em ${new Date(status.lastWebhookAt).toLocaleString('pt-BR')}.` : 'O Meta ainda não mandou nenhuma mensagem para o CRM.'}`
          : 'Ainda não conectado.'
      }
    >
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li>Em developers.facebook.com, crie um app do tipo Empresa e adicione o produto WhatsApp.</li>
        <li>Em WhatsApp, Configuração da API, adicione o número da Arrow Shot e copie o ID do número de telefone e o ID da conta do WhatsApp Business.</li>
        <li>No Gerenciador de Negócios, em Usuários do sistema, crie um usuário administrador, dê acesso ao app e à conta do WhatsApp e gere um token sem validade com as permissões whatsapp_business_messaging e whatsapp_business_management.</li>
        <li>No app, em Configurações, Básico, copie a Chave secreta do aplicativo.</li>
        <li>Cole tudo abaixo e salve.</li>
        <li>Em WhatsApp, Configuração, Webhook, cole a URL e o token de verificação daqui de baixo, salve e assine o campo messages.</li>
      </ol>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={status?.connected ? 'Token (deixe vazio para manter o atual)' : 'Token do usuário do sistema'} required={!status?.connected}>
          <Input type="password" autoComplete="off" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
        </Field>
        <Field label={status?.hasAppSecret ? 'Chave secreta do app (já cadastrada; vazio mantém)' : 'Chave secreta do app'}>
          <Input type="password" autoComplete="off" value={form.appSecret} onChange={(e) => setForm({ ...form, appSecret: e.target.value })} />
        </Field>
        <Field label="ID do número de telefone" required>
          <Input inputMode="numeric" value={form.phoneNumberId} onChange={(e) => setForm({ ...form, phoneNumberId: e.target.value })} />
        </Field>
        <Field label="ID da conta do WhatsApp Business (WABA)" required>
          <Input inputMode="numeric" value={form.wabaId} onChange={(e) => setForm({ ...form, wabaId: e.target.value })} />
        </Field>
      </div>
      <div>
        <Button onClick={save} loading={saving}>
          {status?.connected ? 'Salvar e testar' : 'Conectar'}
        </Button>
      </div>
      {status && (
        <div className="grid gap-3 md:grid-cols-2">
          <CopyLine label="URL do webhook" value={status.webhookUrl} />
          <CopyLine label="Token de verificação" value={status.verifyToken} />
        </div>
      )}
    </Card>
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
    <div className="flex flex-col gap-4 pb-10">
      <ConnectionCard status={status} onSaved={() => (onReloadStatus(), onReloadTemplates())} />

      {s && (
        <>
          <Card title="IA no atendimento" description="Responde sozinha quem chama no WhatsApp, usando a Base de Vendas. Quando a pessoa pede um humano, reclama ou quer fechar, a IA avisa a equipe e para de responder naquela conversa.">
            <Check checked={s.aiEnabled} onChange={(v) => edit((c) => ({ ...c, aiEnabled: v }))} label="IA responde as conversas" hint="Dá para desligar em cada conversa também." />
            <Check checked={s.autoCreateLead} onChange={(v) => edit((c) => ({ ...c, autoCreateLead: v }))} label="Criar lead sozinho quando um número novo chamar" hint="Entra na coluna Novo Lead, com origem WhatsApp direto." />
            <Field label="Instruções extras para a IA">
              <Textarea rows={5} value={s.aiInstructions} onChange={(e) => edit((c) => ({ ...c, aiInstructions: e.target.value }))} placeholder="Ex.: sempre ofereça a reunião de diagnóstico gratuita; horário do Bruno é de 9h às 18h; não fale de preço antes da reunião." />
            </Field>
          </Card>

          <Card title="Follow-up automático" description="Quando o contato para de responder, manda a próxima mensagem depois do tempo de cada passo (contado da última mensagem nossa). Para sozinho se o contato responder, se o lead for para Fechado ou Perdido, ou se a equipe assumir a conversa.">
            <Check checked={s.followUp.enabled} onChange={(v) => edit((c) => ({ ...c, followUp: { ...c.followUp, enabled: v } }))} label="Follow-up ligado" />
            <Check checked={s.followUp.businessHoursOnly} onChange={(v) => edit((c) => ({ ...c, followUp: { ...c.followUp, businessHoursOnly: v } }))} label="Só de segunda a sábado, das 8h às 20h" />
            <ol className="flex flex-col gap-3">
              {s.followUp.steps.map((step, i) => (
                <li key={i} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-700">Passo {i + 1}</h3>
                    <button
                      type="button"
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                      aria-label={`Remover passo ${i + 1}`}
                      onClick={() => edit((c) => ({ ...c, followUp: { ...c.followUp, steps: c.followUp.steps.filter((_, j) => j !== i) } }))}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                  <Field label="Horas depois da última mensagem nossa">
                    <Input
                      type="number"
                      min={1}
                      max={720}
                      value={step.afterHours}
                      onChange={(e) => edit((c) => ({ ...c, followUp: { ...c.followUp, steps: c.followUp.steps.map((x, j) => (j === i ? { ...x, afterHours: Number(e.target.value) || 1 } : x)) } }))}
                    />
                  </Field>
                  <Field label="Texto (dentro de 24h). Vazio = a IA escreve. {nome} vira o primeiro nome.">
                    <Textarea rows={2} value={step.text} onChange={(e) => edit((c) => ({ ...c, followUp: { ...c.followUp, steps: c.followUp.steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) } }))} />
                  </Field>
                  <TemplateSelect
                    label="Modelo para quando já passou de 24h (a variável 1 recebe o primeiro nome)"
                    templates={templates}
                    name={step.templateName}
                    lang={step.templateLang}
                    onChange={(n, l) => edit((c) => ({ ...c, followUp: { ...c.followUp, steps: c.followUp.steps.map((x, j) => (j === i ? { ...x, templateName: n, templateLang: l } : x)) } }))}
                  />
                </li>
              ))}
            </ol>
            {s.followUp.steps.length < 5 && (
              <div>
                <Button
                  variant="secondary"
                  icon={<Plus size={15} aria-hidden="true" />}
                  onClick={() => edit((c) => ({ ...c, followUp: { ...c.followUp, steps: [...c.followUp.steps, { afterHours: 48, text: '', templateName: '', templateLang: 'pt_BR' }] } }))}
                >
                  Adicionar passo
                </Button>
              </div>
            )}
          </Card>

          <Card title="Carrinho abandonado da Loja" description="Quem preenche o telefone no checkout e não paga recebe uma mensagem de modelo. Se responder, a IA atende com as informações do produto (igual ao chat do checkout). Os e-mails de recuperação continuam saindo normalmente.">
            <Check checked={s.cart.enabled} onChange={(v) => edit((c) => ({ ...c, cart: { ...c.cart, enabled: v } }))} label="Mandar WhatsApp para carrinho abandonado" />
            <Field label="Minutos parado no checkout antes de mandar">
              <Input type="number" min={15} max={1440} value={s.cart.afterMinutes} onChange={(e) => edit((c) => ({ ...c, cart: { ...c.cart, afterMinutes: Number(e.target.value) || 40 } }))} />
            </Field>
            <TemplateSelect label="Modelo" templates={templates} name={s.cart.templateName} lang={s.cart.templateLang} onChange={(n, l) => edit((c) => ({ ...c, cart: { ...c.cart, templateName: n, templateLang: l } }))} />
            {cartTpl && cartTpl.vars > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-slate-700">O que vai em cada variável</legend>
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
                <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-slate-600">{cartTpl.body}</p>
              </fieldset>
            )}
            <p className="text-xs text-slate-400">Só funciona nos produtos que pedem telefone no checkout. Produtos privados (Só eu vejo) ficam de fora.</p>
          </Card>

          <div className="sticky bottom-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <Button onClick={save} loading={saving} disabled={!dirty}>
              Salvar configurações
            </Button>
            <Button variant="secondary" icon={<RefreshCw size={15} aria-hidden="true" />} onClick={onReloadTemplates}>
              Atualizar lista de modelos
            </Button>
            <span className="text-xs text-slate-500" role="status">
              {dirty ? 'Alterações não salvas' : 'Tudo salvo'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
