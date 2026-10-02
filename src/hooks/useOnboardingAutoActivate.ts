import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { useClients } from './useClients'
import { useAllMeetings } from './useMeetings'
import { activateClientAfterOnboarding } from '../services/clientService'
import { groupMeetingsByClientType, onboardingComplete, onboardingSteps } from '../utils/onboardingProgress'

/** Montado uma vez no AppLayout (ao lado de useMonthlyConsultingSync): cliente
 *  em Onboarding com as 3 reuniões feitas (check na ficha ou reunião do
 *  módulo Reuniões que já terminou) passa sozinho para Ativo. Só acontece uma
 *  vez por cliente (onboardingAutoActivatedAt), então se alguém voltar o
 *  status pra Onboarding na mão o CRM não desfaz. */
export function useOnboardingAutoActivate() {
  const { profile } = useAuth()
  const clients = useClients()
  const meetings = useAllMeetings()
  const inFlight = useRef(new Set<string>())

  // Só a equipe interna pode alterar o cliente (firestore.rules).
  const ready = !!profile && profile.role !== 'client' && !clients.loading && !meetings.loading && !clients.error && !meetings.error

  useEffect(() => {
    if (!ready || !profile) return
    const timer = setTimeout(() => {
      const byClientType = groupMeetingsByClientType(meetings.data)
      for (const client of clients.data) {
        if (client.status !== 'prospect' || client.onboardingAutoActivatedAt || inFlight.current.has(client.id)) continue
        if (!onboardingComplete(onboardingSteps(client, byClientType))) continue
        inFlight.current.add(client.id)
        activateClientAfterOnboarding(client.id, profile.id, profile.name)
          .then(() => toast.success(`${client.companyName} concluiu o onboarding e agora é cliente Ativo`))
          .catch((err) => {
            console.error('Falha ao ativar cliente após o onboarding', err)
            inFlight.current.delete(client.id)
          })
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [ready, profile, clients.data, meetings.data])
}
