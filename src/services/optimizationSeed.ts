import type { AppUser, Client, OptimizationScheduleRow } from '../types'
import { getOptimizationSchedule, setOptimizationSchedule } from './optimizationService'

/** Calendário fixo de otimizações da Arrow Shot (spec do módulo). Nomes de
 *  gestor e cliente são resolvidos para ids ao importar. "Grupo Ferreira" não
 *  está na base de clientes — é ignorado e reportado. */
const DEFAULT_SCHEDULE: { gestor: string; weekdays: number[]; clients: string[] }[] = [
  { gestor: 'Ciane', weekdays: [1, 3], clients: ['JL Limpeza', 'Help Gestão e Serviços', 'Capricho', 'Grupo Ferreira'] },
  { gestor: 'Ciane', weekdays: [2, 4], clients: ['Dona Help', 'ConSeven', 'Fenix', 'WA Facilities'] },
  { gestor: 'Ciane', weekdays: [3, 5], clients: ['Clean SE', 'Decoralar', 'CasaClean', 'LimpeCenter'] },
  { gestor: 'Nicolas', weekdays: [1, 3], clients: ['TM Clean', 'RR Limpezas', 'Kapta Services'] },
  { gestor: 'Nicolas', weekdays: [2, 4], clients: ['Rennova Clean', 'MNK', 'Caiçara Nord'] },
  { gestor: 'Nicolas', weekdays: [3, 5], clients: ['Celso Pisos', 'Adamax', 'Uniclean', 'Multi Limpeza'] },
]

function findUserId(users: AppUser[], name: string): string | undefined {
  const n = name.toLowerCase()
  return users.find((u) => u.name.toLowerCase().includes(n))?.id
}

function findClientId(clients: Client[], name: string): string | undefined {
  const n = name.trim().toLowerCase()
  return (
    clients.find((c) => c.companyName.trim().toLowerCase() === n)?.id ??
    clients.find((c) => c.companyName.trim().toLowerCase().includes(n))?.id
  )
}

export interface SeedResult {
  seeded: boolean
  rows: number
  unmatchedClients: string[]
  unmatchedGestores: string[]
}

/** Importa o calendário padrão. No-op se já houver linhas cadastradas. */
export async function seedOptimizationSchedule(clients: Client[], users: AppUser[], userId: string): Promise<SeedResult> {
  const existing = await getOptimizationSchedule()
  if (existing.rows && existing.rows.length > 0) {
    return { seeded: false, rows: existing.rows.length, unmatchedClients: [], unmatchedGestores: [] }
  }

  const rows: OptimizationScheduleRow[] = []
  const unmatchedClients: string[] = []
  const unmatchedGestores = new Set<string>()

  for (const group of DEFAULT_SCHEDULE) {
    const gestorId = findUserId(users, group.gestor)
    if (!gestorId) {
      unmatchedGestores.add(group.gestor)
      continue
    }
    for (const clientName of group.clients) {
      const clientId = findClientId(clients, clientName)
      if (!clientId) {
        unmatchedClients.push(clientName)
        continue
      }
      const row = rows.find((r) => r.clientId === clientId)
      if (row) {
        row.weekdays = [...new Set([...row.weekdays, ...group.weekdays])].sort((a, b) => a - b)
      } else {
        rows.push({ clientId, userId: gestorId, weekdays: [...group.weekdays] })
      }
    }
  }

  await setOptimizationSchedule(rows, userId)
  return { seeded: true, rows: rows.length, unmatchedClients, unmatchedGestores: [...unmatchedGestores] }
}
