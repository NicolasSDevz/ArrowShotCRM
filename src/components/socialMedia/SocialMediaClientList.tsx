import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, isBefore, isSameMonth, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { useAllContents } from '../../hooks/useContents'
import { useUsers } from '../../hooks/useUsers'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { CLIENT_PACKAGE_LABEL, STYLE_CATALOG_LABEL, getClientOwnerIds, type Client } from '../../types/client'
import type { Content } from '../../types/content'

/** Mesmo padrão de ClientsPage.tsx: filtro de gestor com default pro
 *  próprio nome quando logado como Ciane/Nicolas. */
const MANAGER_FILTER_NAMES = ['Ciane', 'Nicolas']

function monthSummary(contents: Content[]) {
  const now = new Date()
  const inScope = contents.filter((c) => !c.scheduledDate || isSameMonth(c.scheduledDate.toDate(), now))
  const red = inScope.filter((c) => c.status === 'ideas' || c.status === 'production').length
  const yellow = inScope.filter((c) => c.status === 'review' || c.status === 'waiting_client').length
  const green = inScope.filter((c) => c.status === 'approved' || c.status === 'scheduled' || c.status === 'published').length
  return { red, yellow, green }
}

function nextPublication(contents: Content[]): Content | undefined {
  const today = startOfDay(new Date())
  return contents
    .filter((c) => c.scheduledDate && c.status !== 'cancelled' && !isBefore(c.scheduledDate.toDate(), today))
    .sort((a, b) => a.scheduledDate!.toMillis() - b.scheduledDate!.toMillis())[0]
}

/** Aba "Por cliente" do módulo Social Mídia — um card por cliente com
 *  Social Mídia contratado, resumo de status do mês e atalho pra tela
 *  dedicada do cliente. */
export function SocialMediaClientList() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: clients } = useClients()
  const { data: contents } = useAllContents()
  const { data: users } = useUsers()
  const [managerFilterChoice, setManagerFilterChoice] = useState<string | null>(null)

  const managerFilter =
    managerFilterChoice ?? (MANAGER_FILTER_NAMES.includes(profile?.name ?? '') ? (profile?.name ?? '') : '')

  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])
  const ownerNames = (c: Client) =>
    getClientOwnerIds(c)
      .map((id) => userMap[id]?.name)
      .filter((n): n is string => !!n)

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (c.status === 'churned' || !c.modules?.socialMedia) return false
      if (managerFilter && !ownerNames(c).includes(managerFilter)) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, managerFilter, userMap])

  const contentsByClient = useMemo(() => {
    const map = new Map<string, Content[]>()
    for (const c of contents) {
      const list = map.get(c.clientId)
      if (list) list.push(c)
      else map.set(c.clientId, [c])
    }
    return map
  }, [contents])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <select
          value={managerFilter}
          onChange={(e) => setManagerFilterChoice(e.target.value)}
          className="h-[38px] rounded-lg border border-slate-200 px-3 text-sm transition-all duration-150 ease-in-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Todos os gestores</option>
          {MANAGER_FILTER_NAMES.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nenhum cliente com Social Mídia" description="Marque o serviço na edição do cliente pra ele aparecer aqui." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((client) => {
            const clientContents = contentsByClient.get(client.id) ?? []
            const { red, yellow, green } = monthSummary(clientContents)
            const next = nextPublication(clientContents)
            const ownerId = getClientOwnerIds(client).find((id) => MANAGER_FILTER_NAMES.includes(userMap[id]?.name ?? ''))
            const owner = ownerId ? userMap[ownerId] : undefined

            return (
              <div
                key={client.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={client.companyName} photoURL={client.logoUrl} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-800">{client.companyName}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {client.package && <Badge className="bg-brand-50 text-brand-600">{CLIENT_PACKAGE_LABEL[client.package]}</Badge>}
                      {client.styleCatalog && (
                        <Badge className="bg-slate-100 text-slate-500">{STYLE_CATALOG_LABEL[client.styleCatalog]}</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span title="A produzir">🔴 {red}</span>
                  <span title="Em revisão/aguardando">🟡 {yellow}</span>
                  <span title="Aprovados/agendados">🟢 {green}</span>
                </div>

                <p className="text-xs text-slate-500">
                  {next ? (
                    <>
                      Próxima publicação: <strong className="text-slate-700">{format(next.scheduledDate!.toDate(), 'dd MMM', { locale: ptBR })}</strong> — {next.title}
                    </>
                  ) : (
                    'Nenhuma publicação agendada'
                  )}
                </p>

                <div className="flex items-center justify-between pt-1">
                  {owner ? <Avatar name={owner.name} photoURL={owner.photoURL} size="xs" /> : <span />}
                  <Button size="sm" onClick={() => navigate(`/social-media/${client.id}`)}>
                    Abrir
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
