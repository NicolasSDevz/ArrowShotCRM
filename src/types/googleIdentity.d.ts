/** Minimal ambient types for the Google Identity Services script loaded in
 *  index.html (https://accounts.google.com/gsi/client). Only covers the
 *  OAuth token client surface actually used by useGoogleCalendar. */
interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number
  /** Escopos concedidos, separados por espaço. */
  scope?: string
  error?: string
  error_description?: string
}

interface GoogleTokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void
}

interface Window {
  google?: {
    accounts: {
      oauth2: {
        initTokenClient: (config: {
          client_id: string
          scope: string
          callback: (response: GoogleTokenResponse) => void
        }) => GoogleTokenClient
        revoke: (token: string, callback?: () => void) => void
      }
    }
  }
}
