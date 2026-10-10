import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { BellRing, PlusSquare, Share, Smartphone } from 'lucide-react'
import { Button } from '../ui/Button'
import { pushPublicKey, pushSubscribe, pushTest, pushUnsubscribe } from '../../services/storeApi'

type State = 'loading' | 'unsupported' | 'ios-install' | 'not-configured' | 'denied' | 'off' | 'on'

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** Chave VAPID (base64url) no formato que o PushManager espera. */
function keyToBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js')
}

/** "Notificações neste aparelho": liga o push (venda aprovada, Pix para conferir,
 *  pedido de reembolso). No iPhone só funciona com o CRM adicionado à Tela de
 *  Início e aberto pelo ícone — o cartão explica o passo a passo. */
export function PushNotificationsCard() {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)
  const [publicKey, setPublicKey] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
      if (!supported) return setState(isIos() && !isStandalone() ? 'ios-install' : 'unsupported')
      if (isIos() && !isStandalone()) return setState('ios-install')
      const { publicKey: key } = await pushPublicKey().catch(() => ({ publicKey: null }))
      if (!alive) return
      setPublicKey(key)
      if (!key) return setState('not-configured')
      if (Notification.permission === 'denied') return setState('denied')
      const sub = await (await registration()).pushManager.getSubscription()
      if (alive) setState(sub && Notification.permission === 'granted' ? 'on' : 'off')
    })().catch(() => alive && setState('unsupported'))
    return () => {
      alive = false
    }
  }, [])

  // Tem que ser chamado direto do toque no botão (o iPhone exige).
  const enable = async () => {
    if (!publicKey) return
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off')
        return
      }
      const reg = await registration()
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) }))
      await pushSubscribe(sub.toJSON())
      setState('on')
      toast.success('Notificações ativadas neste aparelho')
    } catch (err) {
      toast.error((err as Error).message || 'Não foi possível ativar')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    try {
      const sub = await (await registration()).pushManager.getSubscription()
      if (sub) {
        await pushUnsubscribe(sub.endpoint).catch(() => {})
        await sub.unsubscribe()
      }
      setState('off')
      toast.success('Notificações desligadas neste aparelho')
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    try {
      await pushTest()
      toast.success('Teste enviado. Deve chegar em alguns segundos.')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') return null

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600" aria-hidden="true">
          <BellRing size={18} />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-800">Notificações neste aparelho</h2>
            <p className="text-sm text-slate-500">Venda aprovada, Pix para conferir e pedido de reembolso chegam como aviso no celular, mesmo com o CRM fechado.</p>
          </div>

          {state === 'ios-install' && (
            <ol className="space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <li>1. Abra este site no <b>Safari</b> do iPhone.</li>
              <li className="flex flex-wrap items-center gap-1">2. Toque em <Share size={15} className="inline" aria-label="Compartilhar" /> <b>Compartilhar</b> e depois em <PlusSquare size={15} className="inline" aria-hidden="true" /> <b>Adicionar à Tela de Início</b>.</li>
              <li>3. Abra o CRM pelo ícone <b>Quiver</b> que apareceu na tela, entre em Notificações e toque em <b>Ativar notificações</b>.</li>
              <li className="text-xs text-slate-500">Precisa do iOS 16.4 ou mais novo. No Android, use o Chrome: menu ⋮ e depois Instalar app.</li>
            </ol>
          )}
          {state === 'unsupported' && <p className="text-sm text-amber-700">Este navegador não recebe notificações. No iPhone use o Safari; no Android, o Chrome.</p>}
          {state === 'not-configured' && <p className="text-sm text-amber-700">Falta cadastrar as chaves das notificações no servidor (VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY na Vercel).</p>}
          {state === 'denied' && (
            <p className="text-sm text-amber-700">
              As notificações foram bloqueadas neste aparelho. No iPhone: Ajustes, Notificações, Quiver, e ligue Permitir Notificações. No Android: segure o ícone do app, Informações do app, Notificações.
            </p>
          )}

          {(state === 'off' || state === 'on') && (
            <div className="flex flex-wrap items-center gap-2">
              {state === 'off' ? (
                <Button icon={<Smartphone size={15} />} loading={busy} onClick={enable}>Ativar notificações</Button>
              ) : (
                <>
                  <span className="text-sm font-medium text-emerald-700">Ativas neste aparelho</span>
                  <Button variant="secondary" size="sm" loading={busy} onClick={test}>Enviar teste</Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={disable}>Desativar</Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
