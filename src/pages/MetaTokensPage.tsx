import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, KeyRound } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { listMetaTokenStatuses, type MetaClientTokenRow } from '../services/metaApi'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { FullPageSpinner } from '../components/ui/FullPageSpinner'
import { MetaTokenRenewModal } from '../components/clients/MetaTokenRenewModal'
import { tokenValidity, fmtExpiry } from '../utils/metaTokenValidity'

export function MetaTokensPage() {
  const { data: clients, loading: clientsLoading } = useClients()
  const [rows, setRows] = useState<MetaClientTokenRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [renew, setRenew] = useState<{ clientId: string; name: string } | null>(null)

  const load = () => {
    setLoadError(null)
    listMetaTokenStatuses()
      .then(setRows)
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Erro ao carregar tokens'))
  }

  useEffect(load, [])

  const table = useMemo(() => {
    const byClient = new Map(rows?.map((r) => [r.clientId, r]) ?? [])
    return clients
      .map((c) => {
        const row = byClient.get(c.id)
        const status = { hasToken: !!row, expiresAt: row?.expiresAt ?? null }
        return {
          client: c,
          row,
          validity: tokenValidity(status),
        }
      })
      .sort((a, b) => {
        if (a.validity.sortWeight !== b.validity.sortWeight) return a.validity.sortWeight - b.validity.sortWeight
        return (a.validity.daysLeft ?? Infinity) - (b.validity.daysLeft ?? Infinity)
      })
  }, [clients, rows])

  if (clientsLoading || (!rows && !loadError)) return <FullPageSpinner label="Carregando tokens…" />

  const urgent = table.filter((t) => t.validity.level === 'red' || t.validity.level === 'yellow').length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900">Tokens Meta Ads</h1>
          <p className="text-[15px] text-[#64748B]">
            {table.length} cliente(s)
            {urgent > 0 && <span className="ml-2 font-semibold text-amber-600">· {urgent} precisam de atenção</span>}
          </p>
        </div>
        <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={load}>
          Atualizar
        </Button>
      </div>

      {loadError ? (
        <EmptyState title="Não foi possível carregar os tokens" description={loadError} />
      ) : table.length === 0 ? (
        <EmptyState title="Nenhum cliente cadastrado" description="Cadastre clientes para gerenciar seus tokens." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[14px]">
              <thead className="border-b border-slate-100 bg-slate-50 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">Cliente</th>
                  <th className="px-4 py-2.5">Status do token</th>
                  <th className="px-4 py-2.5">Expira em</th>
                  <th className="px-4 py-2.5">Última atualização</th>
                  <th className="px-4 py-2.5">Configurado por</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {table.map(({ client, row, validity }) => (
                  <tr key={client.id} className="border-b border-slate-50 text-slate-700 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/clientes/${client.id}`}
                        className="flex items-center gap-2 font-medium text-slate-800 hover:text-brand-700"
                      >
                        <Avatar name={client.companyName} photoURL={client.logoUrl} size="xs" />
                        {client.companyName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${validity.badgeClass}`}
                      >
                        {validity.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{fmtExpiry(row?.expiresAt)}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {row?.updatedAt ? new Date(row.updatedAt).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{row?.updatedBy ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<KeyRound size={13} />}
                        onClick={() => setRenew({ clientId: client.id, name: client.companyName })}
                      >
                        Renovar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {renew && (
        <MetaTokenRenewModal
          open
          onClose={() => setRenew(null)}
          clientId={renew.clientId}
          clientName={renew.name}
          onDone={load}
        />
      )}
    </div>
  )
}
