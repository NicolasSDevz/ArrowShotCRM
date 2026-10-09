import { useEffect, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../../context/AuthContext'
import { Button } from '../../ui/Button'
import { Field, Input, Select } from '../../ui/Field'
import { saveStorePaymentSettings, subscribeStorePaymentSettings } from '../../../services/storeService'
import { Plus, Trash2 } from 'lucide-react'
import { PIX_KEY_TYPE_LABEL, type PixKeyType, type StorePaymentSettings, type StorePixAccount } from '../../../types/store'

const EMPTY: StorePaymentSettings = { pixManual: false, pixKey: '', pixKeyType: 'cnpj', pixName: '', pixCity: '', whatsapp: '', pixAccounts: [] }

const newAccount = (): StorePixAccount => ({ id: `pix_${Date.now().toString(36)}`, label: '', pixKey: '', pixKeyType: 'cnpj', pixName: '', pixCity: '' })

/** Pix direto na conta da empresa (ex.: Nubank): sem taxa, confirmação manual. */
export function StorePaymentSettingsPanel({ mercadoPago }: { mercadoPago: boolean }) {
  const { profile } = useAuth()
  const [form, setForm] = useState<StorePaymentSettings>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(
    () =>
      subscribeStorePaymentSettings((s) => {
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

  const set = (patch: Partial<StorePaymentSettings>) => setForm((f) => ({ ...f, ...patch }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    if (form.pixManual && (!form.pixKey.trim() || !form.pixName.trim() || !form.pixCity.trim())) {
      return toast.error('Preencha a chave, o nome do titular e a cidade')
    }
    const incomplete = (form.pixAccounts ?? []).find((a) => !a.label.trim() || !a.pixKey.trim() || !a.pixName.trim() || !a.pixCity.trim())
    if (incomplete) return toast.error('Preencha apelido, chave, titular e cidade de cada conta extra (ou remova a que não for usar)')
    setBusy(true)
    try {
      await saveStorePaymentSettings({ ...form, pixKey: form.pixKey.trim(), whatsapp: (form.whatsapp ?? '').replace(/\D/g, '') }, profile.id)
      toast.success('Recebimento salvo')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-800">Pix direto na conta (sem taxa)</h2>
          <p className="mt-1 text-sm text-slate-500">
            O checkout gera o Pix com a chave da empresa (Nubank, Inter, qualquer banco) e o dinheiro cai direto na conta. Como o banco não avisa o sistema,
            o pedido fica aguardando até alguém da equipe conferir no app do banco e clicar em <strong>Confirmar pagamento</strong> na aba Vendas. Aí o acesso é liberado.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={form.pixManual} onChange={(e) => set({ pixManual: e.target.checked })} className="h-4 w-4" />
          Usar Pix direto na conta {mercadoPago ? '(no lugar do Pix do Mercado Pago; o cartão continua pelo Mercado Pago)' : ''}
        </label>
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <Field label="Tipo da chave">
            <Select value={form.pixKeyType} onChange={(e) => set({ pixKeyType: e.target.value as PixKeyType })}>
              {Object.entries(PIX_KEY_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Chave Pix" required><Input value={form.pixKey} onChange={(e) => set({ pixKey: e.target.value })} placeholder={form.pixKeyType === 'phone' ? '(27) 99999-9999' : ''} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome do titular da conta" required><Input value={form.pixName} onChange={(e) => set({ pixName: e.target.value })} placeholder="Como aparece no banco" /></Field>
          <Field label="Cidade do titular" required><Input value={form.pixCity} onChange={(e) => set({ pixCity: e.target.value })} placeholder="Vitória" /></Field>
        </div>
        <fieldset className="space-y-3 rounded-xl border border-dashed border-slate-300 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-700">Outras contas Pix (opcional)</legend>
          <p className="text-xs text-slate-500">
            Cadastre outra chave se algum produto deve cair em outra conta. Depois, no produto (aba Geral), escolha a conta. Produto sem escolha cai na conta principal acima.
          </p>
          {(form.pixAccounts ?? []).map((a, i) => {
            const setAcc = (patch: Partial<StorePixAccount>) => set({ pixAccounts: (form.pixAccounts ?? []).map((x, j) => (j === i ? { ...x, ...patch } : x)) })
            return (
              <div key={a.id} className="space-y-2 rounded-lg bg-slate-50 p-3">
                <div className="flex gap-2">
                  <Field label="Apelido da conta"><Input value={a.label} onChange={(e) => setAcc({ label: e.target.value })} placeholder="Ex.: Inter, Conta do Bruno" /></Field>
                  <button
                    type="button"
                    onClick={() => set({ pixAccounts: (form.pixAccounts ?? []).filter((_, j) => j !== i) })}
                    className="mt-5 self-start rounded-lg px-2 py-2 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                    aria-label={`Remover a conta ${a.label || i + 2}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[150px_1fr]">
                  <Field label="Tipo da chave">
                    <Select value={a.pixKeyType} onChange={(e) => setAcc({ pixKeyType: e.target.value as PixKeyType })}>
                      {Object.entries(PIX_KEY_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </Select>
                  </Field>
                  <Field label="Chave Pix"><Input value={a.pixKey} onChange={(e) => setAcc({ pixKey: e.target.value })} /></Field>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Nome do titular"><Input value={a.pixName} onChange={(e) => setAcc({ pixName: e.target.value })} /></Field>
                  <Field label="Cidade do titular"><Input value={a.pixCity} onChange={(e) => setAcc({ pixCity: e.target.value })} /></Field>
                </div>
              </div>
            )
          })}
          <button type="button" onClick={() => set({ pixAccounts: [...(form.pixAccounts ?? []), newAccount()] })} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
            <Plus size={15} /> Adicionar outra conta Pix
          </button>
        </fieldset>
        <Field label="WhatsApp para receber comprovantes (opcional)">
          <Input value={form.whatsapp ?? ''} onChange={(e) => set({ whatsapp: e.target.value })} placeholder="(27) 99999-9999" inputMode="tel" />
        </Field>
        <Button type="submit" loading={busy} disabled={!loaded}>Salvar recebimento</Button>
      </form>

      <aside className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        <h3 className="font-semibold text-slate-800">Como fica a rotina</h3>
        <ol className="list-decimal space-y-1.5 pl-4">
          <li>O cliente paga o Pix pelo checkout.</li>
          <li>O CRM avisa no sino: "Pix para conferir", com nome e valor.</li>
          <li>Você confere no app do banco se o valor caiu no nome dele.</li>
          <li>Na aba Vendas, clica em Confirmar pagamento.</li>
          <li>O acesso é liberado na hora e aparece na tela do cliente (e no e-mail, se configurado).</li>
        </ol>
        <p className="text-xs text-slate-400">Cada Pix leva o código do pedido na descrição, o que ajuda a achar no extrato. Pedidos que não forem pagos podem ser cancelados na mesma aba.</p>
      </aside>
    </div>
  )
}
