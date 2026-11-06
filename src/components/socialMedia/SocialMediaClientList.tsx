import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, isBefore, startOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { cycleTargetMonth as clientCycleMonth } from '../../utils/socialCycle'
import { useAllContents } from '../../hooks/useContents'
import { useUsers } from '../../hooks/useUsers'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { getClientOwnerIds, isClientInOperation, type Client } from '../../types/client'
import { socialPlanLabel } from '../../types/socialPlan'
import { CYCLE_STAGE_CLASS, CYCLE_STAGE_LABEL, clientCycle } from '../../utils/socialCycle'
import { monthLabel } from '../../services/socialMonthService'
import type { Content } from '../../types/content'

/** Mesmo padrão de ClientsPage.tsx: filtro de gestor com default pro
 *  próprio nome quando logado como Ciane/Nicolas. */
const MANAGER_FILTER_NAMES = ['Ciane', 'Nicolas']

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

  const contentsByClient = useMemo(() => {
    const map = new Map<string, Content[]>()
    for (const c of contents) {
      const list = map.get(c.clientId)
      if (list) list.push(c)
      else map.set(c.clientId, [c])
    }
    return map
  }, [contents])

  const cycles = useMemo(() => new Map(clients.map((c) => [c.id, clientCycle(contentsByClient.get(c.id) ?? [])])), [clients, contentsByClient])

  // Atrasados primeiro, depois quem está mais no começo do ciclo.
  const filtered = useMemo(() => {
    const order = ['plan', 'production', 'review', 'client', 'schedule', 'done']
    return clients
      .filter((c) => {
        if (!isClientInOperation(c) || !c.modules?.socialMedia) return false
        if (managerFilter && !ownerNames(c).includes(managerFilter)) return false
        return true
      })
      .sort((a, b) => {
        const ca = cycles.get(a.id)!, cb = cycles.get(b.id)!
        if (!!ca.late !== !!cb.late) return ca.late ? -1 : 1
        return order.indexOf(ca.stage) - order.indexOf(cb.stage)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, managerFilter, userMap, cycles])

  const lateCount = filtered.filter((c) => cycles.get(c.id)?.late).length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Ciclo de <strong className="text-slate-700">{monthLabel(clientCycleMonth())}</strong>
          {lateCount > 0 ? (
            <span className="ml-2 rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">{lateCount} atrasado(s)</span>
          ) : (
            <span className="ml-2 text-xs text-emerald-600">tudo no prazo</span>
          )}
        </p>
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
            const cycle = cycles.get(client.id)!
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
                      {client.socialPlan ? (
                        <Badge className="bg-brand-50 text-brand-600">{socialPlanLabel(client.socialPlan)}</Badge>
                      ) : (
                        <Badge className="bg-amber-50 text-amber-700">Sem plano definido</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Badge className={CYCLE_STAGE_CLASS[cycle.stage]}>{CYCLE_STAGE_LABEL[cycle.stage]}</Badge>
                    {cycle.total > 0 && (
                      <span className="text-xs text-slate-500">
                        {cycle.counts.scheduled}/{cycle.total} agendados
                      </span>
                    )}
                  </div>
                  {cycle.total > 0 && (
                    <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100" title="Produção · Revisão · Cliente · Aprovado · Agendado">
                      {(['production', 'review', 'client', 'approved', 'scheduled'] as const).map((k) => (
                        <div
                          key={k}
                          style={{ width: `${(cycle.counts[k] / cycle.total) * 100}%` }}
                          className={{ production: 'bg-blue-400', review: 'bg-amber-400', client: 'bg-violet-400', approved: 'bg-teal-400', scheduled: 'bg-emerald-500' }[k]}
                        />
                      ))}
                    </div>
                  )}
                  {cycle.late && <p className="text-xs font-semibold text-red-600">⚠️ {cycle.late}</p>}
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
