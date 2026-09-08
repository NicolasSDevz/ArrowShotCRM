import { useState } from 'react'
import toast from 'react-hot-toast'
import { KeyRound, ExternalLink, CheckCircle2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Input } from '../ui/Field'
import { Button } from '../ui/Button'
import { exchangeMetaToken } from '../../services/metaApi'

/** Modal "Renovar Token Meta Ads" — troca um token curto do Explorador da
 *  API do Graph por um de longa duração (~60 dias) e salva na ficha do
 *  cliente. Usado na aba Acessos e na página de gestão de tokens. */
export function MetaTokenRenewModal({
  open,
  onClose,
  clientId,
  clientName,
  onDone,
}: {
  open: boolean
  onClose: () => void
  clientId: string
  clientName: string
  onDone?: () => void
}) {
  const [shortToken, setShortToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ expiresAt: string } | null>(null)

  const close = () => {
    setShortToken('')
    setResult(null)
    setBusy(false)
    onClose()
  }

  const handleExchange = async () => {
    if (!shortToken.trim()) {
      toast.error('Cole o token gerado no Explorador da API do Graph.')
      return
    }
    setBusy(true)
    try {
      const r = await exchangeMetaToken(clientId, shortToken.trim())
      setResult({ expiresAt: r.expires_at })
      setShortToken('')
      onDone?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao renovar o token')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={close} title="Renovar Token Meta Ads" width="max-w-lg">
      <div className="flex flex-col gap-4 text-sm text-slate-700">
        <p className="text-xs text-slate-500">
          Cliente: <strong>{clientName}</strong>
        </p>

        {result ? (
          <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={16} /> Token renovado com sucesso! Válido por 60 dias.
            </p>
            <p className="text-xs">
              Expira em <strong>{new Date(result.expiresAt).toLocaleDateString('pt-BR')}</strong>. Os relatórios deste
              cliente já usam o novo token.
            </p>
            <Button size="sm" onClick={close} className="mt-1 self-start">
              Fechar
            </Button>
          </div>
        ) : (
          <>
            <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed">
              <li>
                Acesse o{' '}
                <a
                  href="https://developers.facebook.com/tools/explorer/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-brand-600 underline"
                >
                  Explorador da API do Graph <ExternalLink size={11} />
                </a>
              </li>
              <li>
                Selecione o app <strong>Arrow Shot CRM</strong>
              </li>
              <li>
                Clique em <strong>Generate Access Token</strong>
              </li>
              <li>
                Marque as permissões: <code className="text-[11px]">ads_read</code>,{' '}
                <code className="text-[11px]">read_insights</code>, <code className="text-[11px]">ads_management</code>
              </li>
              <li>Copie o token gerado e cole abaixo:</li>
            </ol>

            <div>
              <span className="mb-1 block text-xs font-medium text-slate-500">Token curto</span>
              <Input
                type="password"
                autoComplete="off"
                value={shortToken}
                onChange={(e) => setShortToken(e.target.value)}
                placeholder="Cole o token gerado no Explorador da API..."
              />
            </div>

            <p className="text-[11px] text-slate-400">
              A troca é feita pelo servidor (o APP_SECRET nunca vai pro navegador). O token longo é salvo criptografado
              e nunca é exibido depois.
            </p>

            <Button
              icon={<KeyRound size={14} />}
              onClick={handleExchange}
              loading={busy}
              disabled={busy || !shortToken.trim()}
              className="self-start"
            >
              Gerar token de 60 dias
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}
