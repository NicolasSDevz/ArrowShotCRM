import { useEffect, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../../context/AuthContext'
import { Button } from '../../ui/Button'
import { Field, Input, Select } from '../../ui/Field'
import { saveStorePaymentSettings, subscribeStorePaymentSettings } from '../../../services/storeService'
import { PIX_KEY_TYPE_LABEL, type PixKeyType, type StorePaymentSettings } from '../../../types/store'

const EMPTY: StorePaymentSettings = { pixManual: false, pixKey: '', pixKeyType: 'cnpj', pixName: '', pixCity: '', whatsapp: '' }

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
