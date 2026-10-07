import { useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTeamMembers } from './useTeamMembers'
import { resolveDashboardArea } from '../utils/dashboardAreas'

/** Área de quem está logado (ver utils/dashboardAreas.ts). */
export function useDashboardArea() {
  const { profile } = useAuth()
  const { data: teamMembers } = useTeamMembers()
  return useMemo(() => resolveDashboardArea(profile, teamMembers), [profile, teamMembers])
}
