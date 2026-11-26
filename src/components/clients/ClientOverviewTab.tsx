import type { ReactNode } from 'react'
import { differenceInCalendarDays, differenceInMonths, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CheckSquare } from 'lucide-react'
import { useClientMeetings } from '../../hooks/useMeetings'
import { PrivateData } from '../ui/PrivateData'
import { Avatar } from '../ui/Avatar'
import { ClientOnboardingMeetingsSection } from './ClientOnboardingMeetingsSection'
import { formatBRL } from '../../utils/pricing'
import { TASK_STATUS_LABEL, type Task } from '../../types/task'
import type { Client } from '../../types/client'
import type { AppUser } from '../../types'

/** "2 meses", "1 ano e 3 meses", "12 dias". */
function clientSince(start: Date): string {
  const months = differenceInMonths(new Date(), start)
  if (months < 1) {
    const days = Math.max(0, differenceInCalendarDays(new Date(), start))
    return `${days} dia${days === 1 ? '' : 's'}`
  }
  const years = Math.floor(months / 12)
  const rest = months % 12
  const y = years > 0 ? `${years} ano${years === 1 ? '' : 's'}` : ''
  const m = rest > 0 ? `${rest} ${rest === 1 ? 'mês' : 'meses'}` : ''
  return [y, m].filter(Boolean).join(' e ')
}

function Block({ id, title, children, className = '' }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
      <h3 id={id} className="mb-2 text-sm font-semibold text-slate-800">
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Primeira aba da ficha: o essencial do cliente num lugar só. Cada bloco tem
 *  título (h3) pra quem usa leitor de tela pular de um pro outro com a tecla H. */
export function ClientOverviewTab({
  client,
  owners,
  tasks,
  onOpenTask,
}: {
  client: Client
  owners: AppUser[]
  tasks: Task[]
  onOpenTask: (id: string) => void
}) {
  const { data: meetings } = useClientMeetings(client.id)
  const start = client.contractStartDate?.toDate?.() ?? client.createdAt?.toDate?.()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const nextMeeting = meetings
    .filter((m) => m.date?.toDate && m.date.toDate() >= today)
    .sort((a, b) => a.date.toMillis() - b.date.toMillis())[0]
  const openTasks = tasks
    .filter((t) => t.status !== 'done')
    .sort((a, b) => (a.dueDate?.toMillis() ?? Infinity) - (b.dueDate?.toMillis() ?? Infinity))

  const summary: { label: string; value: ReactNode }[] = [
    { label: 'Valor mensal', value: client.monthlyValue ? <PrivateData value={formatBRL(client.monthlyValue)} mask="R$ ••••" /> : 'Não informado' },
    { label: 'Cliente há', value: start ? clientSince(start) : 'Não informado' },
    { label: 'Responsáveis', value: owners.length ? owners.map((o) => o.name).join(', ') : 'Nenhum' },
    {
      label: 'Próxima reunião',
      value: nextMeeting
        ? `${format(nextMeeting.date.toDate(), "EEE, dd 'de' MMM", { locale: ptBR })}${nextMeeting.time ? ` às ${nextMeeting.time}` : ''}`
        : 'Nenhuma marcada',
    },
  ]

  const contactLines: { label: string; value: ReactNode }[] = [
    ...(client.whatsapp ? [{ label: 'WhatsApp principal', value: <PrivateData value={client.whatsapp} mask="••• •••••-••••" /> }] : []),
    ...(client.contacts ?? []).map((c) => ({
      label: c.role ? `${c.name}, ${c.role}` : c.name,
      value: c.whatsapp ? <PrivateData value={c.whatsapp} mask="••• •••••-••••" /> : 'sem WhatsApp',
    })),
    ...(client.email ? [{ label: 'E-mail', value: <PrivateData value={client.email} mask="••••••@••••••.com" /> }] : []),
    ...(client.instagram ? [{ label: 'Instagram', value: client.instagram }] : []),
    ...(client.website ? [{ label: 'Site', value: client.website }] : []),
    ...(client.city ? [{ label: 'Cidade ou região', value: <PrivateData value={client.city} /> }] : []),
    ...(client.document ? [{ label: 'CNPJ ou CPF', value: <PrivateData value={client.document} /> }] : []),
  ]

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="overview-summary">
        <h3 id="overview-summary" className="sr-only">
          Resumo do contrato
        </h3>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 lg:grid-cols-4">
          {summary.map((s) => (
            <div key={s.label} className="bg-white px-4 py-3">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{s.label}</dt>
              <dd className="mt-0.5 text-[15px] font-semibold text-slate-800">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="overview-notes" className="rounded-xl border-l-[3px] border-amber-400 bg-slate-50 px-4 py-3">
        <h3 id="overview-notes" className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
          O que foi vendido e combinado
        </h3>
        {client.notes?.trim() ? (
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{client.notes}</p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Nenhuma observação. Clique em Editar e escreva o que foi vendido ou prometido a este cliente.</p>
        )}
      </section>

      <ClientOnboardingMeetingsSection client={client} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Block id="overview-contact" title="Contato">
          {contactLines.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum contato cadastrado.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {contactLines.map((c, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-3 py-1.5 text-sm">
                  <span className="text-slate-500">{c.label}</span>
                  <span className="font-medium text-slate-800">{c.value}</span>
                </li>
              ))}
            </ul>
          )}
          {owners.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              Responsáveis na equipe:
              {owners.map((o) => (
                <span key={o.id} className="flex items-center gap-1 text-slate-700">
                  <Avatar name={o.name} photoURL={o.photoURL} size="xs" /> {o.name}
                </span>
              ))}
            </p>
          )}
        </Block>

        <Block id="overview-pending" title={`Pendências (${openTasks.length})`}>
          {openTasks.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma tarefa em aberto.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {openTasks.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(t.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <CheckSquare size={14} className="shrink-0 text-slate-300" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-slate-700">{t.title}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {TASK_STATUS_LABEL[t.status]}
                      {t.dueDate ? `, até ${format(t.dueDate.toDate(), 'dd/MM')}` : ''}
                    </span>
                  </button>
                </li>
              ))}
              {openTasks.length > 6 && <li className="text-xs text-slate-400">E mais {openTasks.length - 6}.</li>}
            </ul>
          )}
        </Block>
      </div>
    </div>
  )
}
