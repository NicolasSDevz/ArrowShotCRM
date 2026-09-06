import type { ComponentType } from 'react'
import { differenceInMinutes, differenceInHours, isToday, isYesterday, format } from 'date-fns'
import {
  CheckSquare,
  AtSign,
  Clock,
  ThumbsUp,
  RotateCcw,
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  UserPlus,
  ClipboardList,
  Palette,
  BarChart3,
  BellRing,
  FilePlus2,
  Pencil,
  Trash2,
  Target,
  Sparkles,
  Send,
  Upload,
  ArrowRightLeft,
  Video,
  HeartPulse,
} from 'lucide-react'
import type { AppNotification, NotificationType } from '../../types'

type IconType = ComponentType<{ size?: number; className?: string }>

/** Icon per notification type — new types match the platform spec 1-to-1;
 *  legacy types (task_assigned, mention...) keep their original icon. */
export const NOTIFICATION_ICON: Record<NotificationType, IconType> = {
  task_assigned: CheckSquare,
  mention: AtSign,
  approval_requested: Clock,
  content_approved: ThumbsUp,
  change_requested: RotateCcw,
  due_soon: Clock,
  briefing_scheduled: CalendarClock,
  task_completed: CheckCircle2,
  task_overdue: AlertTriangle,
  new_client: UserPlus,
  briefing_filled: ClipboardList,
  content_review_requested: Palette,
  content_ready_to_schedule: CheckCircle2,
  funnel_saved: BarChart3,
  task_reminder: BellRing,
  task_created: FilePlus2,
  task_updated: Pencil,
  client_status_changed: ArrowRightLeft,
  client_deleted: Trash2,
  planning_saved: Target,
  content_created: Sparkles,
  content_published: Send,
  content_imported: Upload,
  lead_created: UserPlus,
  lead_stage_changed: ArrowRightLeft,
  lead_converted: CheckCircle2,
  meeting_created: Video,
  report_created: BarChart3,
  team_member_added: UserPlus,
  member_health_updated: HeartPulse,
}

/** Icon chip background/text, per the spec's colors (azul, verde, vermelho,
 *  azul escuro, roxo, âmbar, cinza). Legacy types stay neutral slate. */
export const NOTIFICATION_ICON_STYLE: Record<NotificationType, string> = {
  task_assigned: 'bg-slate-100 text-slate-500',
  mention: 'bg-slate-100 text-slate-500',
  approval_requested: 'bg-slate-100 text-slate-500',
  content_approved: 'bg-slate-100 text-slate-500',
  change_requested: 'bg-slate-100 text-slate-500',
  due_soon: 'bg-slate-100 text-slate-500',
  briefing_scheduled: 'bg-blue-50 text-blue-600',
  task_completed: 'bg-emerald-50 text-emerald-600',
  task_overdue: 'bg-red-50 text-red-600',
  new_client: 'bg-indigo-50 text-indigo-700',
  briefing_filled: 'bg-purple-50 text-purple-600',
  content_review_requested: 'bg-amber-50 text-amber-600',
  content_ready_to_schedule: 'bg-emerald-50 text-emerald-600',
  funnel_saved: 'bg-slate-100 text-slate-500',
  task_reminder: 'bg-amber-50 text-amber-600',
  task_created: 'bg-slate-100 text-slate-500',
  task_updated: 'bg-slate-100 text-slate-500',
  client_status_changed: 'bg-indigo-50 text-indigo-700',
  client_deleted: 'bg-red-50 text-red-600',
  planning_saved: 'bg-blue-50 text-blue-600',
  content_created: 'bg-violet-50 text-violet-600',
  content_published: 'bg-emerald-50 text-emerald-600',
  content_imported: 'bg-violet-50 text-violet-600',
  lead_created: 'bg-blue-50 text-blue-600',
  lead_stage_changed: 'bg-slate-100 text-slate-500',
  lead_converted: 'bg-emerald-50 text-emerald-600',
  meeting_created: 'bg-blue-50 text-blue-600',
  report_created: 'bg-slate-100 text-slate-500',
  team_member_added: 'bg-indigo-50 text-indigo-700',
  member_health_updated: 'bg-purple-50 text-purple-600',
}

/** "há 5 minutos" / "há 2 horas" / "ontem às 14:30" / "dd/MM/yyyy às HH:mm". */
export function formatNotificationTime(date: Date): string {
  const now = new Date()
  const minutes = differenceInMinutes(now, date)
  if (minutes < 1) return 'agora mesmo'
  if (minutes < 60) return `há ${minutes} minuto${minutes === 1 ? '' : 's'}`
  if (isToday(date)) {
    const hours = differenceInHours(now, date)
    return `há ${hours} hora${hours === 1 ? '' : 's'}`
  }
  if (isYesterday(date)) return `ontem às ${format(date, 'HH:mm')}`
  return format(date, "dd/MM/yyyy 'às' HH:mm")
}

/** Where clicking a notification should navigate to — the task/content
 *  targets carry the id as a query param so the destination page can open
 *  the right drawer directly (see TasksPage/SocialMediaPage). */
export function resolveNotificationRoute(n: Pick<AppNotification, 'entityType' | 'entityId'>): string | null {
  if (!n.entityType) return null
  switch (n.entityType) {
    case 'client':
      return n.entityId ? `/clientes/${n.entityId}` : '/clientes'
    case 'task':
      return n.entityId ? `/tarefas?task=${n.entityId}` : '/tarefas'
    case 'content':
      return n.entityId ? `/social-media?content=${n.entityId}` : '/social-media'
    case 'lead':
      return '/leads'
    case 'meeting':
      return '/reunioes'
    case 'report':
      return '/relatorios'
    default:
      return null
  }
}
