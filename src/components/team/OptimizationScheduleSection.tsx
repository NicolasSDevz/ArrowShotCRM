import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarCog, Download } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { useUsers } from '../../hooks/useUsers'
import { useOptimizationSchedule } from '../../hooks/useOptimizations'
import { seedOptimizationSchedule } from '../../services/optimizationSeed'
import { Button } from '../ui/Button'
import { weekdaysLabel } from '../../types'

export function OptimizationScheduleSection() {
  const { profile } = useAuth()
  const { data: clients } = useClients()
  const { data: users } = useUsers()
  const { rows, loading } = useOptimizationSchedule()
  const [seeding, setSeeding] = useState(false)

  const byGestor = useMemo(() => {
    const clientName = (id: string) => clients.find((c) => c.id === id)?.companyName ?? '(cliente removido)'
    const userName = (id: string) => users.find((u) => u.id === id)?.name ?? '(usuário removido)'
    const groups = new Map<string, { name: string; entries: { client: string; days: number[] }[] }>()
    for (const r of rows) {
      if (!groups.has(r.userId)) groups.set(r.userId, { name: userName(r.userId), entries: [] })
      groups.get(r.userId)!.entries.push({ client: clientName(r.clientId), days: r.weekdays })
    }
    for (const g of groups.values()) g.entries.sort((a, b) => a.client.localeCompare(b.client))
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [rows, clients, users])

  const handleSeed = async () => {
    if (!profile) return
    setSeeding(true)
    try {
      const res = await seedOptimizationSchedule(clients, users, profile.id)
      if (!res.seeded) {
        toast('O calendário já está cadastrado.')
      } else {
        toast.success(`Calendário importado — ${res.rows} clientes.`)
        if (res.unmatchedClients.length) {
          toast(`Não encontrados na base: ${res.unmatchedClients.join(', ')}`, { icon: '⚠️', duration: 6000 })
        }
        if (res.unmatchedGestores.length) {
          toast(`Gestores não encontrados: ${res.unmatchedGestores.join(', ')}`, { icon: '⚠️', duration: 6000 })
        }
      }
    } catch (err) {
      console.error(err)
      toast.error('Erro ao importar o calendário')
    } finally {
      setSeeding(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <CalendarCog size={15} className="text-slate-400" /> Calendário de otimizações
        </h2>
        {rows.length === 0 && (
          <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={handleSeed} loading={seeding}>
            Importar calendário padrão
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">
          Nenhum calendário cadastrado. Clique em "Importar calendário padrão" para carregar a distribuição
          fixa (Ciane / Nicolas). Os dias de cada cliente também podem ser editados na aba Otimizações da ficha.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {byGestor.map((g) => (
            <div key={g.name} className="rounded-xl border border-slate-100 bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-slate-800">{g.name}</p>
              <ul className="flex flex-col gap-1 text-sm text-slate-600">
                {g.entries.map((e, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="truncate">{e.client}</span>
                    <span className="shrink-0 text-xs text-slate-400">{weekdaysLabel(e.days)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
