import { useEffect, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { CheckCircle2, KeyRound } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { Button } from '../../ui/Button'
import { Field, Input, Select, Textarea } from '../../ui/Field'
import { saveStoreInvoiceSettings, subscribeStoreInvoiceSettings } from '../../../services/storeService'
import { storeSaveInvoiceToken } from '../../../services/storeApi'
import type { StoreInvoiceSettings } from '../../../types/store'

const EMPTY: StoreInvoiceSettings = {
  enabled: false,
  environment: 'homologacao',
  cnpj: '',
  inscricaoMunicipal: '',
  codigoMunicipio: '',
  itemListaServico: '',
  codigoTributarioMunicipio: '',
  codigoCnae: '',
  aliquota: 2,
  simplesNacional: true,
  naturezaOperacao: 1,
  discriminacao: 'Acesso ao curso online: {produtos}. Pedido {pedido}.',
}

/** Nota fiscal de serviço automática (Focus NFe) a cada venda aprovada. */
export function StoreInvoicePanel({ hasToken, onTokenSaved }: { hasToken: boolean; onTokenSaved: () => void }) {
  const { profile } = useAuth()
  const [form, setForm] = useState<StoreInvoiceSettings>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')
  const [savingToken, setSavingToken] = useState(false)

  useEffect(
    () =>
      subscribeStoreInvoiceSettings((s) => {
        setLoaded((was) => {
          if (!was) setForm({ ...EMPTY, ...(s ?? {}) })
          return true
        })
      },
      (err) => {
        // Não trava o botão em silêncio: avisa e deixa salvar mesmo assim.
        console.error(err)
        toast.error('Não foi possível carregar a configuração salva. Recarregue a página.')
        setLoaded(true)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const set = (patch: Partial<StoreInvoiceSettings>) => setForm((f) => ({ ...f, ...patch }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (form.enabled) {
      if (!hasToken) return toast.error('Cadastre o token da Focus NFe antes de ligar')
      if (form.cnpj.replace(/\D/g, '').length !== 14) return toast.error('CNPJ inválido')
      if (!form.inscricaoMunicipal.trim()) return toast.error('Informe a inscrição municipal')
      if (form.codigoMunicipio.replace(/\D/g, '').length !== 7) return toast.error('Código do município (IBGE) tem 7 dígitos')
      if (!form.itemListaServico.trim()) return toast.error('Informe o item da lista de serviço')
    }
    setBusy(true)
    try {
      await saveStoreInvoiceSettings({ ...form, aliquota: Number(form.aliquota) || 0 }, profile.id)
      toast.success(form.enabled ? `Nota fiscal automática ligada (${form.environment === 'producao' ? 'produção' : 'teste'})` : 'Configuração salva')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const saveToken = async () => {
    setSavingToken(true)
    try {
      await storeSaveInvoiceToken(token)
      setToken('')
      toast.success('Token salvo (guardado criptografado)')
      onTokenSaved()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSavingToken(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-800">Nota fiscal automática</h2>
          <p className="mt-1 text-sm text-slate-500">
            A cada venda aprovada (Pix ou cartão), o CRM pede a nota fiscal de serviço à prefeitura pela Focus NFe. Quando é autorizada, o PDF aparece na aba Vendas e
            a nota vai por e-mail para o comprador. No reembolso, a nota é cancelada. Com a nota ligada, o checkout passa a pedir CPF ou CNPJ.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="h-4 w-4" />
          Emitir nota automaticamente em cada venda
        </label>

        <Field label="Ambiente">
          <Select value={form.environment} onChange={(e) => set({ environment: e.target.value as StoreInvoiceSettings['environment'] })}>
            <option value="homologacao">Teste (homologação, nota sem valor fiscal)</option>
            <option value="producao">Produção (nota de verdade)</option>
          </Select>
        </Field>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Empresa (prestador)</legend>
          <Field label="CNPJ" required><Input value={form.cnpj} onChange={(e) => set({ cnpj: e.target.value })} inputMode="numeric" /></Field>
          <Field label="Inscrição municipal" required><Input value={form.inscricaoMunicipal} onChange={(e) => set({ inscricaoMunicipal: e.target.value })} /></Field>
          <Field label="Código do município (IBGE, 7 dígitos)" required><Input value={form.codigoMunicipio} onChange={(e) => set({ codigoMunicipio: e.target.value })} inputMode="numeric" placeholder="3205309 = Vitória" /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.simplesNacional} onChange={(e) => set({ simplesNacional: e.target.checked })} className="h-4 w-4" />
            Optante do Simples Nacional
          </label>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Serviço (confirme com o contador)</legend>
          <Field label="Item da lista de serviço (LC 116)" required><Input value={form.itemListaServico} onChange={(e) => set({ itemListaServico: e.target.value })} placeholder="0802" /></Field>
          <Field label="Alíquota do ISS (%)" required><Input type="number" step="0.01" min={0} value={form.aliquota} onChange={(e) => set({ aliquota: Number(e.target.value) })} /></Field>
          <Field label="Código tributário do município (se a prefeitura pedir)"><Input value={form.codigoTributarioMunicipio ?? ''} onChange={(e) => set({ codigoTributarioMunicipio: e.target.value })} /></Field>
          <Field label="CNAE (se a prefeitura pedir)"><Input value={form.codigoCnae ?? ''} onChange={(e) => set({ codigoCnae: e.target.value })} inputMode="numeric" /></Field>
          <div className="sm:col-span-2">
            <Field label="Texto da nota ({produtos}, {pedido} e {cliente} são trocados automaticamente)">
              <Textarea rows={2} value={form.discriminacao} onChange={(e) => set({ discriminacao: e.target.value })} />
            </Field>
          </div>
        </fieldset>

        <Button type="submit" loading={busy} disabled={!loaded}>Salvar nota fiscal</Button>
      </form>

      <aside className="space-y-4">
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><KeyRound size={16} aria-hidden="true" /> Token da Focus NFe</h3>
          {hasToken ? (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 size={16} aria-hidden="true" /> Token cadastrado. Para trocar, cole o novo abaixo.</p>
          ) : (
            <p className="text-sm text-amber-700">Nenhum token cadastrado ainda.</p>
          )}
          <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Token da Focus NFe" placeholder="Cole o token aqui" autoComplete="off" />
          <Button variant="secondary" onClick={saveToken} loading={savingToken} disabled={token.trim().length < 10}>Salvar token</Button>
          <p className="text-xs text-slate-400">Use o token de homologação para testar e o de produção para valer. Ele fica guardado criptografado no servidor e não aparece mais na tela.</p>
        </section>

        <section className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          <h3 className="font-semibold text-slate-800">Para configurar (uma vez)</h3>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>Crie a conta em focusnfe.com.br e cadastre a empresa.</li>
            <li>No painel da Focus, envie o certificado digital A1 (arquivo .pfx e senha).</li>
            <li>Copie o token e cole aqui ao lado.</li>
            <li>Com o contador, preencha inscrição municipal, item de serviço e alíquota.</li>
            <li>Ligue em Teste, faça uma venda de R$ 1,00 e confira a nota.</li>
            <li>Funcionou? Troque para Produção (e cole o token de produção).</li>
          </ol>
          <p className="text-xs text-slate-400">
            Opcional: no painel da Focus, em Gatilhos (webhooks), cadastre {window.location.origin}/api/loja?action=invoice-webhook para a nota aparecer no CRM na hora.
            Sem isso, o CRM confere ao abrir a aba Vendas e uma vez por dia.
          </p>
        </section>
      </aside>
    </div>
  )
}
