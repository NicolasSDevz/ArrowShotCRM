const SCOPE = 'https://www.googleapis.com/auth/calendar.events'
/** Permite ligar a gravação automática nas salas do Meet criadas pelo Google Agenda. */
export const MEET_SETTINGS_SCOPE = 'https://www.googleapis.com/auth/meetings.space.settings'
const STORAGE_KEY = 'google_calendar_token'

interface StoredToken {
  accessToken: string
  expiresAt: number // epoch ms
  /** Escopos concedidos, separados por espaço (tokens antigos não têm). */
  scope?: string
}

function readStoredToken(extraScopes: string[] = []): StoredToken | null {
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredToken
    if (parsed.expiresAt < Date.now() + 60_000) return null // expired / about to expire
    const granted = (parsed.scope ?? SCOPE).split(' ')
    if (extraScopes.some((s) => !granted.includes(s))) return null // falta escopo pedido agora
    return parsed
  } catch {
    return null
  }
}

function storeToken(accessToken: string, expiresInSeconds: number, scope?: string) {
  const stored: StoredToken = { accessToken, expiresAt: Date.now() + expiresInSeconds * 1000, scope }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

export function getCachedAccessToken(): string | null {
  return readStoredToken()?.accessToken ?? null
}

export function clearAccessToken() {
  sessionStorage.removeItem(STORAGE_KEY)
}

/** Opens the Google consent popup (or silently renews if already granted).
 *  Resolves with a short-lived access token — never a refresh token, this is
 *  a pure client-side "public client" flow with nothing stored server-side. */
export function requestAccessToken(interactive: boolean, extraScopes: string[] = []): Promise<string> {
  const cached = readStoredToken(extraScopes)
  if (cached && !interactive) return Promise.resolve(cached.accessToken)

  if (!window.google) {
    return Promise.reject(new Error('Google Identity Services ainda não carregou. Recarregue a página e tente de novo.'))
  }

  return new Promise((resolve, reject) => {
    // initTokenClient's callback is fixed at creation time, so a fresh client
    // is created per call — cheap, and keeps each call's resolve/reject scoped correctly.
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: [SCOPE, ...extraScopes].join(' '),
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || 'Autorização recusada'))
          return
        }
        storeToken(response.access_token, response.expires_in ?? 3600, response.scope)
        resolve(response.access_token)
      },
    })
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' })
  })
}

export interface GoogleCalendarEvent {
  id: string
  summary: string
  start: string // ISO datetime or date
  end: string
  hangoutLink?: string
  htmlLink: string
  attendees?: { email: string; responseStatus?: string }[]
}

export async function listUpcomingEvents(accessToken: string, maxResults = 15): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime',
  })
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Erro ao buscar eventos (${res.status})`)
  const data = await res.json()
  return (data.items ?? []).map((item: Record<string, unknown>) => ({
    id: item.id,
    summary: item.summary || '(Sem título)',
    start: (item.start as Record<string, string>)?.dateTime || (item.start as Record<string, string>)?.date,
    end: (item.end as Record<string, string>)?.dateTime || (item.end as Record<string, string>)?.date,
    hangoutLink: item.hangoutLink,
    htmlLink: item.htmlLink,
    attendees: item.attendees,
  }))
}

export async function createMeetingEvent(
  accessToken: string,
  params: {
    summary: string
    description?: string
    startDateTime: string // ISO
    endDateTime: string // ISO
    attendeeEmails: string[]
  }
): Promise<GoogleCalendarEvent> {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: params.summary,
        description: params.description,
        start: { dateTime: params.startDateTime },
        end: { dateTime: params.endDateTime },
        attendees: params.attendeeEmails.map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Erro ao criar reunião (${res.status}): ${body}`)
  }
  const item = await res.json()
  return {
    id: item.id,
    summary: item.summary,
    start: item.start?.dateTime || item.start?.date,
    end: item.end?.dateTime || item.end?.date,
    hangoutLink: item.hangoutLink,
    htmlLink: item.htmlLink,
    attendees: item.attendees,
  }
}

/** Liga a gravação automática da sala do Meet (Meet REST API v2). Só funciona
 *  em conta Google Workspace com gravação liberada e com o escopo
 *  MEET_SETTINGS_SCOPE concedido; lança erro com o motivo quando não dá. */
export async function enableMeetAutoRecording(accessToken: string, meetLink: string): Promise<void> {
  const code = meetLink.split('/').pop()?.split('?')[0]
  if (!code) throw new Error('Link do Meet inválido')
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

  const spaceRes = await fetch(`https://meet.googleapis.com/v2/spaces/${encodeURIComponent(code)}`, { headers })
  if (!spaceRes.ok) throw new Error(`Não achei a sala do Meet (${spaceRes.status}): ${await spaceRes.text()}`)
  const space = (await spaceRes.json()) as { name: string }

  const res = await fetch(
    `https://meet.googleapis.com/v2/${space.name}?updateMask=config.artifactConfig.recordingConfig.autoRecordingGeneration`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ config: { artifactConfig: { recordingConfig: { autoRecordingGeneration: 'ON' } } } }),
    }
  )
  if (!res.ok) throw new Error(`Não consegui ligar a gravação automática (${res.status}): ${await res.text()}`)
}
