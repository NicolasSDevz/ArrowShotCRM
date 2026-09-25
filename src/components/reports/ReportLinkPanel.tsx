import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Link2, Copy, ExternalLink } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { disableReportLink, getActiveReportLink, getOrCreateReportLink, reportLinkUrl } from '../../services/reportLinkService'
import { showError } from '../../utils/notifyError'
import { Button } from '../ui/Button'
import type { Client } from '../../types'

/** Link ao vivo do cliente (ele abre sem login e escolhe as datas) — criar,
 *  copiar e desativar. Fica no topo do histórico de relatórios do cliente. */
export function ReportLinkPanel({ client }: { client: Client }) {
  const { profile } = useAuth()
  const [token, setToken] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setToken(undefined)
    getActiveReportLink(client.id)
      .then((t) => !cancelled && setToken(t))
      .catch(() => !cancelled && setToken(null))
    return () => {
      cancelled = true
    }
  }, [client.id])

  const copy = async (t: string) => {
    await navigator.clipboard.writeText(reportLinkUrl(t))
    toast.success('Link copiado')
  }

  const create = async () => {
    if (!profile) return
    setBusy(true)
    try {
      const link = await getOrCreateReportLink(client, profile.id, profile.name)
      setToken(link.token)
      await copy(link.token)
    } catch (err) {
      showError(err, 'Erro ao criar o link')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    if (!profile || !token) return
    if (!confirm('Desativar o link? Quem tiver o endereço atual não vai mais conseguir abrir.')) return
    setBusy(true)
    try {
      await disableReportLink(token, profile.id)
      setToken(null)
      toast.success('Link desativado')
    } catch (err) {
      showError(err, 'Erro ao desativar o link')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3.5">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
        <Link2 size={14} className="text-brand-600" /> Link ao vivo pro cliente
      </p>
      <p className="mt-0.5 text-xs text-slate-500">Ele abre sem login, escolhe as datas e vê os números do Meta e do Google na hora.</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {token === undefined ? (
          <span className="text-xs text-slate-400">Verificando…</span>
        ) : token ? (
          <>
            <Button size="sm" icon={<Copy size={13} />} onClick={() => copy(token)} disabled={busy}>
              Copiar link
            </Button>
            <Button size="sm" variant="ghost" icon={<ExternalLink size={13} />} onClick={() => window.open(reportLinkUrl(token), '_blank')}>
              Abrir
            </Button>
            <button type="button" onClick={disable} disabled={busy} className="ml-auto text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50">
              Desativar link
            </button>
          </>
        ) : (
          <Button size="sm" icon={<Link2 size={13} />} onClick={create} loading={busy}>
            Criar link e copiar
          </Button>
        )}
      </div>
    </div>
  )
}
