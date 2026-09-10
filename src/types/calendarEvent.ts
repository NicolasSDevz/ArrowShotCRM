import type { Timestamp } from 'firebase/firestore'
import type { BaseDoc } from './common'

export type CalendarEventType = 'content' | 'task' | 'custom' | 'birthday'

/** Denormalized calendar entry. Contents/tasks with dates are projected here
 *  (or read directly — see calendarService) so the calendar can query one
 *  cheap collection instead of fanning out across modules as more are added. */
export interface CalendarEvent extends BaseDoc {
  title: string
  type: CalendarEventType
  date: Timestamp
  time?: string
  clientId?: string
  refType?: 'content' | 'task'
  refId?: string

  // --- só quando type === 'birthday' (ver birthdayService) ---
  /** id do BriefingContact — chave para atualizar/remover o evento certo. */
  contactId?: string
  contactName?: string
  /** dígitos prontos p/ wa.me (ex: "5511999998888"). */
  contactWhatsapp?: string
  /** Mês/dia do aniversário — o cron confere por aqui, independente do ano
   *  gravado em `date`, e o calendário renderiza todo ano. */
  birthdayMonth?: number
  birthdayDay?: number
  /** Ano em que a notificação de "aniversário hoje" já foi enviada. */
  lastNotifiedYear?: number
}
