import { useEffect, useMemo, useState } from 'react'
import { subscribeStoreLinks, subscribeStorePaymentSettings } from '../../services/storeService'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, Copy, CopyPlus, ExternalLink, Lock, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { auth } from '../../firebase/config'
import { useStoreMemberAreas, useStoreMpAccounts, useStoreProducts } from '../../hooks/useStore'
import { storeSetPrivate } from '../../services/storeApi'
import { deleteStoreProduct, updateStoreProduct } from '../../services/storeService'
import { askConfirm } from '../../utils/confirmDialog'
import { maskCurrencyInput, parseCurrencyToNumber } from '../../utils/masks'
import { Tabs } from '../../components/ui/Tabs'
import { Button } from '../../components/ui/Button'
import { Field, Input, Select, Textarea } from '../../components/ui/Field'
import { FullPageSpinner } from '../../components/ui/FullPageSpinner'
import { ImageField } from '../../components/store/admin/ImageField'
import { CheckoutDesigner } from '../../components/store/admin/CheckoutDesigner'
import { ContentEditor } from '../../components/store/admin/ContentEditor'
import { copyText } from '../../components/store/admin/StoreOrdersTable'
import { DuplicateProductModal } from '../../components/store/admin/DuplicateProductModal'
import { canUsePrivate, defaultCheckoutConfig, defaultMembersConfig, formatCents, membersBasePath, type StoreProduct } from '../../types/store'

const card = 'space-y-3 rounded-2xl border border-slate-200 bg-white p-5'

/** JSON com as chaves em ordem e sem `undefined`. O Firestore devolve os campos
 *  em outra ordem (e sem os vazios) depois de salvar; comparar com JSON.stringify
 *  puro deixava o aviso "Alterações não salvas" preso na tela. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => [k, v[k]]))
      : v
  )
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4" />
      <span>
        {label}
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      </span>
    </label>
  )
}

/** Garante que produtos antigos/incompletos tenham todos os campos de config. */
function normalize(p: StoreProduct): StoreProduct {
  return {
    ...p,
    paymentMethods: p.paymentMethods ?? { pix: true, card: true },
    checkout: { ...defaultCheckoutConfig(), ...p.checkout, countdown: { ...defaultCheckoutConfig().countdown, ...p.checkout?.countdown } },
    members: { ...defaultMembersConfig(), ...p.members },
  }
}

/** /loja/produtos/:id — tudo de um produto: dados, tela do checkout, aulas, área de membros e links. */
export function StoreProductPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: products, loading } = useStoreProducts()
  const { data: areas } = useStoreMemberAreas()
  const { data: mpAccounts } = useStoreMpAccounts()
  const server = products.find((p) => p.id === id)
  const [privBusy, setPrivBusy] = useState(false)
  const [draft, setDraft] = useState<StoreProduct | null>(null)
  const [saving, setSaving] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [pixAccounts, setPixAccounts] = useState<{ id: string; label: string }[]>([])
  const [pixManual, setPixManual] = useState(false)
  const [principalLabel, setPrincipalLabel] = useState('Conta principal')

  const [storeLinks, setStoreLinks] = useState<{ checkoutDomain?: string | null } | null>(null)
  useEffect(() => subscribeStoreLinks(setStoreLinks), [])
  useEffect(
    () =>
      subscribeStorePaymentSettings((s) => {
        setPixAccounts((s?.pixAccounts ?? []).map((a) => ({ id: a.id, label: a.label })))
        setPixManual(s?.pixManual === true)
        setPrincipalLabel(s?.mpPrincipalLabel || 'Conta principal')
      }),
    []
  )

  // O rascunho nasce do servidor uma vez; depois só muda pela tela (salvar grava tudo).
  useEffect(() => {
    if (server && (!draft || draft.id !== server.id)) setDraft(normalize(server))
  }, [server, draft])

  const dirty = useMemo(() => {
    if (!server || !draft) return false
    // privateTo muda pelo servidor (botão Só eu vejo), não pelo Salvar.
    const strip = ({ updatedAt: _u, updatedBy: _b, lessonCount: _l, privateTo: _p, ...rest }: StoreProduct) => rest
    return stableJson(strip(normalize(server))) !== stableJson(strip(draft))
  }, [server, draft])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (loading) return <FullPageSpinner />
  if (!server || !draft) {
    return (
      <div className="p-6 text-center text-sm text-slate-500">
        Produto não encontrado. <Link to="/loja?aba=produtos" className="text-brand-600 hover:underline">Voltar para a Loja</Link>
      </div>
    )
  }

  const set = (patch: Partial<StoreProduct>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const setCheckout = (patch: Partial<StoreProduct['checkout']>) => setDraft((d) => (d ? { ...d, checkout: { ...d.checkout, ...patch } } : d))
  const setMembers = (patch: Partial<StoreProduct['members']>) => setDraft((d) => (d ? { ...d, members: { ...d.members, ...patch } } : d))

  const save = async () => {
    if (!profile) return
    if (!draft.name.trim()) return toast.error('O produto precisa de um nome')
    if (!/^[a-z0-9-]{3,64}$/.test(draft.slug)) return toast.error('Endereço do checkout: só letras minúsculas, números e hífen')
    if (draft.slug !== server.slug && products.some((p) => p.id !== draft.id && p.slug === draft.slug)) return toast.error('Esse endereço já está em uso por outro produto')
    setSaving(true)
    try {
      const { id: _id, createdAt: _c, createdBy: _cb, updatedAt: _u, updatedBy: _ub, lessonCount: _l, ...data } = draft
      await updateStoreProduct(draft.id, data, profile.id)
      toast.success('Produto salvo')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const togglePrivate = async (on: boolean) => {
    if (!(await askConfirm({ title: on ? 'Deixar privado?' : 'Mostrar para a equipe?', message: on ? 'Produto, vendas e alunos ficam só com você. Sem nota fiscal automática.' : 'A equipe volta a ver o produto e as vendas.', confirmLabel: on ? 'Deixar privado' : 'Mostrar' }))) return
    setPrivBusy(true)
    try {
      const r = await storeSetPrivate(server.id, on)
      toast.success(on ? `Privado (${r.moved.orders} vendas junto)` : 'Visível pra equipe')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setPrivBusy(false)
    }
  }

  const remove = async () => {
    if (!(await askConfirm({ title: `Excluir "${server.name}"?`, message: 'Some o produto, o checkout e as aulas. Pedidos e alunos continuam registrados.', confirmLabel: 'Excluir produto', danger: true }))) return
    await deleteStoreProduct(server.id)
    toast.success('Produto excluído')
    navigate('/loja?aba=produtos')
  }

  const origin = window.location.origin
  const checkoutUrl = storeLinks?.checkoutDomain ? `https://${storeLinks.checkoutDomain}/${server.slug}` : `${origin}/pay/${server.slug}`
  const area = areas.find((a) => a.id === draft.membersAreaId)
  const membersUrl = `${origin}${membersBasePath(area?.slug)}`

  const general = (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={card}>
        <h2 className="text-[15px] font-semibold text-slate-800">Produto</h2>
        <Field label="Nome" required><Input value={draft.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Descrição (aparece no checkout e na área de membros)"><Textarea rows={4} value={draft.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <ImageField label="Imagem do produto" value={draft.imageUrl} onChange={(v) => set({ imageUrl: v })} productId={draft.id} assetKey="product" hint="Quadrada, 600 x 600 px. Vale também para a capa e o banner do curso e as capas dos módulos, se você não colocar outras. O banner principal da área fica em Loja, aba Área de membros, Início." aspect="aspect-square" />
        <Field label="E-mail de suporte (aparece para o comprador)"><Input type="email" value={draft.supportEmail ?? ''} onChange={(e) => set({ supportEmail: e.target.value || null })} /></Field>
        <Field label="Status">
          <Select value={draft.status} onChange={(e) => set({ status: e.target.value as StoreProduct['status'] })}>
            <option value="draft">Rascunho (checkout fora do ar)</option>
            <option value="active">No ar (vendendo)</option>
            <option value="archived">Arquivado</option>
          </Select>
        </Field>
      </section>
      <section className={card}>
        <h2 className="text-[15px] font-semibold text-slate-800">Preço e pagamento</h2>
        <Field label="Conta de recebimento (Pix e cartão)">
          <Select value={draft.mpAccountId ?? ''} onChange={(e) => set({ mpAccountId: e.target.value || null })}>
            <option value="">{principalLabel}</option>
            {mpAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        </Field>
        {mpAccounts.length === 0 && <p className="-mt-1 text-xs text-slate-400">Pra receber em outra conta, adicione ela em Loja, aba Recebimento.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço" required><Input inputMode="numeric" value={maskCurrencyInput(String(draft.price))} onChange={(e) => set({ price: Math.round((parseCurrencyToNumber(e.target.value) ?? 0) * 100) })} /></Field>
          <Field label="Preço riscado (opcional)"><Input inputMode="numeric" value={draft.comparePrice ? maskCurrencyInput(String(draft.comparePrice)) : ''} onChange={(e) => { const v = parseCurrencyToNumber(e.target.value); set({ comparePrice: v ? Math.round(v * 100) : null }) }} /></Field>
        </div>
        <Field label="Parcelas no cartão (máximo)">
          <Select value={draft.maxInstallments} onChange={(e) => set({ maxInstallments: Number(e.target.value) })}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'Só à vista' : `Até ${n}x`}</option>)}
          </Select>
        </Field>
        <Toggle label="Aceitar Pix" checked={draft.paymentMethods.pix} onChange={(v) => set({ paymentMethods: { ...draft.paymentMethods, pix: v } })} />
        {draft.paymentMethods.pix && pixManual && pixAccounts.length > 0 && (
          <Field label="Conta Pix que recebe este produto">
            <Select value={draft.pixAccountId ?? ''} onChange={(e) => set({ pixAccountId: e.target.value || null })}>
              <option value="">Conta principal</option>
              {pixAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </Field>
        )}
        {draft.paymentMethods.pix && (
          <Field label="Desconto para quem paga no Pix (%)">
            <Input
              type="number"
              min={0}
              max={90}
              value={draft.pixDiscountPercent ?? 0}
              onChange={(e) => set({ pixDiscountPercent: Math.min(90, Math.max(0, Number(e.target.value) || 0)) })}
            />
          </Field>
        )}
        {(draft.pixDiscountPercent ?? 0) > 0 && (
          <p className="text-xs text-emerald-700">
            No Pix sai por {formatCents(Math.round(draft.price * (1 - (draft.pixDiscountPercent ?? 0) / 100)))} (o desconto vale sobre o total, com order bumps).
          </p>
        )}
        <Toggle label="Aceitar cartão de crédito" checked={draft.paymentMethods.card} onChange={(v) => set({ paymentMethods: { ...draft.paymentMethods, card: v } })} />
        <Field label="Nome na fatura do cartão (até 13 letras)"><Input maxLength={13} value={draft.statementDescriptor ?? ''} onChange={(e) => set({ statementDescriptor: e.target.value || null })} placeholder="ARROWSHOT" /></Field>
        <Toggle
          label="Modo teste"
          checked={draft.testMode}
          onChange={(v) => set({ testMode: v })}
          hint="Só vale enquanto o Mercado Pago não está configurado: o checkout libera o acesso sem cobrar, para conferir o fluxo inteiro. Desligue antes de divulgar."
        />
        <Toggle
          label="Reembolso automático dentro da garantia"
          checked={draft.autoRefund === true}
          onChange={(v) => set({ autoRefund: v })}
          hint={`O aluno pede em Meu perfil e o dinheiro volta na hora pelo Mercado Pago, com o acesso removido (garantia de ${draft.checkout.guaranteeDays || 0} dias, muda na Configuração de tela). Pix direto na conta continua manual: o pedido chega pra você devolver pelo banco.`}
        />
      </section>
    </div>
  )

  const membersTab = (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={card}>
        <h2 className="text-[15px] font-semibold text-slate-800">Em qual área de membros</h2>
        <Field label="Área de membros do curso">
          <Select value={draft.membersAreaId ?? ''} onChange={(e) => set({ membersAreaId: e.target.value || null })}>
            <option value="">Principal ({origin}/membros)</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name} ({origin}/m/{a.slug})</option>)}
          </Select>
        </Field>
        <p className="text-xs text-slate-400">Cada área tem o próprio visual e só mostra os cursos dela. Crie áreas novas em Loja, aba Área de membros. O link de acesso da compra já abre na área escolhida.</p>
        <h2 className="pt-2 text-[15px] font-semibold text-slate-800">Visual do curso</h2>
        <ImageField label="Banner do curso (topo da página do curso)" value={draft.members.bannerUrl} onChange={(v) => setMembers({ bannerUrl: v })} productId={draft.id} assetKey="members-banner" fallback={draft.imageUrl} hint="1920 x 700 px" aspect="aspect-[16/6]" />
        <ImageField label="Capa do curso (vertical)" value={draft.members.coverUrl} onChange={(v) => setMembers({ coverUrl: v })} productId={draft.id} assetKey="members-cover" fallback={draft.imageUrl} hint="600 x 900 px" aspect="aspect-[2/3]" />
        <ImageField label="Logo (cabeçalho)" value={draft.members.logoUrl} onChange={(v) => setMembers({ logoUrl: v })} productId={draft.id} assetKey="members-logo" aspect="aspect-[3/1]" />
        <Field label="Cor principal">
          <div className="flex gap-2">
            <input type="color" value={draft.members.primaryColor} onChange={(e) => setMembers({ primaryColor: e.target.value })} className="h-[38px] w-12 rounded-lg border border-slate-200" aria-label="Cor principal: seletor" />
            <Input value={draft.members.primaryColor} onChange={(e) => setMembers({ primaryColor: e.target.value })} aria-label="Cor principal: código" />
          </div>
        </Field>
        <Field label="Título de boas-vindas"><Input value={draft.members.welcomeTitle ?? ''} onChange={(e) => setMembers({ welcomeTitle: e.target.value })} placeholder={draft.name} /></Field>
        <Field label="Texto de boas-vindas"><Textarea rows={3} value={draft.members.welcomeText ?? ''} onChange={(e) => setMembers({ welcomeText: e.target.value })} /></Field>
      </section>
      <section className={card}>
        <h2 className="text-[15px] font-semibold text-slate-800">Comunidade e certificado</h2>
        <Toggle label="Permitir comentários nas aulas" checked={draft.members.commentsEnabled} onChange={(v) => setMembers({ commentsEnabled: v })} />
        <Toggle label="Comentário só aparece depois de aprovado" checked={draft.members.commentsNeedApproval} onChange={(v) => setMembers({ commentsNeedApproval: v })} hint="Você aprova na aba Comentários da Loja." />
        <Toggle label="Certificado ao concluir 100% das aulas" checked={draft.members.certificateEnabled} onChange={(v) => setMembers({ certificateEnabled: v })} />
        <Field label="Carga horária no certificado (horas)"><Input type="number" min={0} value={draft.members.certificateHours ?? ''} onChange={(e) => setMembers({ certificateHours: e.target.value ? Number(e.target.value) : undefined })} /></Field>
        <Field label="Nome do produtor (assina o certificado e as respostas)"><Input value={draft.members.producerName ?? ''} onChange={(e) => setMembers({ producerName: e.target.value })} /></Field>
      </section>
      <section className={card}>
        <h2 className="text-[15px] font-semibold text-slate-800">Vitrine para quem não comprou</h2>
        <Toggle
          label="Mostrar este produto bloqueado na área de membros, com botão de comprar"
          hint="Aparece para os alunos dos outros produtos, em Mais conteúdos. Só vale com o produto No ar."
          checked={draft.members.showInCatalog !== false}
          onChange={(v) => setMembers({ showInCatalog: v })}
        />
        {draft.members.showInCatalog !== false && (
          <Field label="Link do botão Comprar (opcional)">
            <Input value={draft.members.salesUrl ?? ''} onChange={(e) => setMembers({ salesUrl: e.target.value.trim() || null })} placeholder={checkoutUrl} />
          </Field>
        )}
        {draft.members.showInCatalog !== false && <p className="text-xs text-slate-400">Em branco, o botão leva para o checkout deste produto. Use uma página de vendas, se tiver (precisa começar com https://). A vitrine atualiza em até 5 minutos.</p>}
      </section>
    </div>
  )

  const links = (
    <div className="space-y-4">
      <section className={card}>
        <h2 className="text-[15px] font-semibold text-slate-800">Link do checkout</h2>
        {server.status !== 'active' && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">O produto está como {server.status === 'draft' ? 'rascunho' : 'arquivado'}: o link só funciona depois de colocar No ar e salvar.</p>}
        <div className="flex flex-wrap gap-2">
          <Input readOnly value={checkoutUrl} aria-label="Link do checkout" className="flex-1" onFocus={(e) => e.currentTarget.select()} />
          <Button variant="secondary" icon={<Copy size={15} />} onClick={() => copyText(checkoutUrl, 'Link do checkout copiado')}>Copiar</Button>
          <a href={checkoutUrl} target="_blank" rel="noreferrer" className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><ExternalLink size={15} /> Abrir</a>
        </div>
        <Field label="Endereço (final do link)"><Input value={draft.slug} onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /></Field>
        <p className="text-xs text-slate-400">Para rastrear campanhas, use UTMs no link: {checkoutUrl}?utm_source=meta&utm_campaign=nome. Elas ficam salvas em cada pedido.</p>
      </section>
      <section className={card}>
        <h2 className="text-[15px] font-semibold text-slate-800">Área de membros</h2>
        <div className="flex flex-wrap gap-2">
          <Input readOnly value={membersUrl} aria-label="Link da área de membros" className="flex-1" />
          <Button variant="secondary" icon={<Copy size={15} />} onClick={() => copyText(membersUrl, 'Link copiado')}>Copiar</Button>
        </div>
        <p className="text-xs text-slate-400">O comprador entra pelo link de acesso que aparece depois do pagamento (e no e-mail, se configurado). Depois pode criar senha e entrar por {membersUrl}/login.</p>
      </section>
      <section className={card}>
        <h2 className="text-[15px] font-semibold text-red-700">Zona de perigo</h2>
        <Button variant="danger" icon={<Trash2 size={15} />} onClick={remove}>Excluir produto</Button>
      </section>
    </div>
  )

  return (
    <div className="space-y-4 pb-20">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/loja?aba=produtos" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Voltar para a Loja"><ArrowLeft size={18} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-slate-900">{server.name}</h1>
          <p className="text-xs text-slate-500">{server.status === 'active' ? 'No ar' : server.status === 'draft' ? 'Rascunho' : 'Arquivado'}</p>
        </div>
        {/* Só eu vejo: cadeado discreto, só aparece pra quem pode usar (ver PRIVATE_OWNER_EMAILS). */}
        {canUsePrivate(auth.currentUser?.email) && (
          <button
            type="button"
            disabled={privBusy}
            onClick={() => togglePrivate(!server.privateTo)}
            title={server.privateTo ? 'Privado: só você vê. Clique pra mostrar pra equipe.' : 'Deixar privado (só você vê)'}
            aria-label={server.privateTo ? 'Produto privado. Mostrar para a equipe' : 'Deixar o produto privado'}
            aria-pressed={!!server.privateTo}
            className={`flex h-[38px] w-[38px] items-center justify-center rounded-lg transition disabled:opacity-50 ${server.privateTo ? 'bg-slate-800 text-white hover:bg-slate-700' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500'}`}
          >
            <Lock size={15} />
          </button>
        )}
        <Button
          variant="secondary"
          icon={<CopyPlus size={15} />}
          onClick={() => (dirty ? toast.error('Salve as alterações antes de duplicar') : setDuplicating(true))}
        >
          Duplicar
        </Button>
        <Button icon={<Save size={15} />} loading={saving} disabled={!dirty} onClick={save}>{dirty ? 'Salvar alterações' : 'Salvo'}</Button>
      </header>

      <Tabs
        label="Configurações do produto"
        tabs={[
          { label: 'Geral', content: general },
          { label: 'Configuração de tela', content: <CheckoutDesigner product={draft} allProducts={products} onChange={setCheckout} /> },
          { label: 'Conteúdo', content: <ContentEditor product={server} /> },
          { label: 'Área de membros', content: membersTab },
          { label: 'Links', content: links },
        ]}
      />

      {duplicating && <DuplicateProductModal product={server} onClose={() => setDuplicating(false)} />}

      {dirty && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4" role="status">
          <div className="flex items-center gap-3 rounded-xl bg-navy-950 px-4 py-2.5 text-sm text-white shadow-lg">
            Alterações não salvas
            <Button size="sm" loading={saving} onClick={save}>Salvar</Button>
            <button className="text-xs text-slate-400 hover:text-white" onClick={() => setDraft(normalize(server))}>Descartar</button>
          </div>
        </div>
      )}
    </div>
  )
}
