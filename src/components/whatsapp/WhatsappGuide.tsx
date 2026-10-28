import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bot, Check, ExternalLink, FileText, MessageCircle, Smartphone, Timer, UserRound } from 'lucide-react'
import type { WaSettings, WaStatus, WaTemplate } from '../../types/whatsapp'

/** Guia da tela de WhatsApp: como funciona (4 passos) + checklist do que falta,
 *  calculado com os dados reais da conexão, dos modelos e das configurações. */

const TEMPLATES_URL = 'https://business.facebook.com/wa/manage/message-templates/'

type Item = { id: string; done: boolean; optional?: boolean; title: string; text: ReactNode; action?: ReactNode }

function hoursLabel(h: number) {
  if (h % 24 === 0) return h === 24 ? '1 dia' : `${h / 24} dias`
  return `${h}h`
}

export function buildChecklist(status: WaStatus | null, templates: WaTemplate[], settings: WaSettings | null, canConfigure: boolean): Item[] {
  const approved = templates.filter((t) => t.status === 'APPROVED').length
  const pending = templates.filter((t) => t.status === 'PENDING').length
  const toConfig = canConfigure ? (
    <Link to="/whatsapp?aba=config" className="inline-flex items-center gap-1 font-semibold text-brand-500 hover:underline">
      Abrir Configurações <ArrowRight size={13} aria-hidden="true" />
    </Link>
  ) : null
  return [
    {
      id: 'conn',
      done: Boolean(status?.connected),
      title: 'Conectar o número da Arrow Shot',
      text: status?.connected ? `Conectado: ${status.verifiedName ? `${status.verifiedName}, ` : ''}${status.displayPhone}.` : 'Liga o número pela API oficial do Meta.',
      action: status?.connected ? undefined : toConfig,
    },
    {
      id: 'test',
      done: Boolean(status?.lastWebhookAt),
      title: 'Fazer o teste: mandar um "oi"',
      text: status?.lastWebhookAt ? (
        'O Meta já está entregando as mensagens para o CRM.'
      ) : (
        <>
          Do seu celular pessoal, mande um "oi" para {status?.displayPhone || 'o número da Arrow Shot'}. Em segundos a conversa aparece aqui e a IA responde. Se não aparecer em 1 minuto, falta ligar o webhook no Meta (passo 6 do guia em Configurações).
        </>
      ),
      action: status?.lastWebhookAt ? undefined : toConfig,
    },
    {
      id: 'ai',
      done: Boolean(settings?.aiInstructions.trim()),
      optional: true,
      title: 'Dizer à IA como você atende',
      text: 'A IA já responde com a Base de Vendas. Aqui você completa: horário, o que oferecer, o que não falar.',
      action: toConfig,
    },
    {
      id: 'tpl',
      done: approved > 0,
      title: 'Ter pelo menos um modelo aprovado',
      text:
        approved > 0
          ? `${approved} ${approved === 1 ? 'modelo aprovado' : 'modelos aprovados'}${pending ? `, ${pending} em análise` : ''}.`
          : `O WhatsApp só deixa escrever livre até 24h depois da última mensagem do cliente. Depois disso, e para chamar alguém primeiro, só com modelo aprovado pelo Meta.${pending ? ` Você tem ${pending} em análise.` : ''}`,
      action: (
        <a href={TEMPLATES_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-500 hover:underline">
          Criar modelo no Meta <ExternalLink size={12} aria-hidden="true" />
          <span className="sr-only">(abre em nova aba)</span>
        </a>
      ),
    },
  ]
}

function Flow({ settings }: { settings: WaSettings | null }) {
  const steps = settings?.followUp.steps.map((s) => hoursLabel(s.afterHours)) || []
  const cards: { icon: ReactNode; tone: string; title: string; text: string }[] = [
    {
      icon: <Smartphone size={18} />,
      tone: 'bg-emerald-500/15 text-emerald-400',
      title: 'Cliente chama',
      text: `A conversa aparece em Conversas${settings?.autoCreateLead !== false ? ' e o número entra nos Leads' : ''}.`,
    },
    {
      icon: <Bot size={18} />,
      tone: 'bg-violet-500/15 text-violet-400',
      title: 'IA responde na hora',
      text: settings?.aiEnabled === false ? 'Hoje a IA está desligada: quem responde é a equipe.' : 'Usa a Base de Vendas, 24 horas por dia. Entende áudio também.',
    },
    {
      icon: <UserRound size={18} />,
      tone: 'bg-amber-500/15 text-amber-400',
      title: 'Equipe assume',
      text: 'Se o cliente pede uma pessoa, reclama ou quer fechar, a IA para e você recebe uma notificação.',
    },
    {
      icon: <Timer size={18} />,
      tone: 'bg-sky-500/15 text-sky-400',
      title: 'Sumiu? Follow-up',
      text:
        settings && !settings.followUp.enabled
          ? 'Follow-up desligado nas Configurações.'
          : `Se parar de responder, o CRM lembra sozinho${steps.length ? ` depois de ${steps.join(', ')}` : ''}.`,
    },
  ]
  return (
    <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Como funciona, em 4 passos">
      {cards.map((c, i) => (
        <li key={c.title} className="relative flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.tone}`} aria-hidden="true">
            {c.icon}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-800">
              <span className="mr-1 text-slate-400">{i + 1}.</span>
              {c.title}
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{c.text}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function WhatsappGuide({
  status,
  templates,
  settings,
  canConfigure,
  hasConversations,
  onClose,
}: {
  status: WaStatus | null
  templates: WaTemplate[]
  settings: WaSettings | null
  canConfigure: boolean
  hasConversations: boolean
  onClose?: () => void
}) {
  const items = buildChecklist(status, templates, settings, canConfigure)
  const required = items.filter((i) => !i.optional)
  const doneCount = required.filter((i) => i.done).length
  const next = items.find((i) => !i.done && !i.optional)
  const pct = Math.round((doneCount / required.length) * 100)

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 md:p-6" aria-labelledby="wa-guide-title">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400" aria-hidden="true">
          <MessageCircle size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="wa-guide-title" className="text-lg font-semibold text-slate-900">
            {hasConversations ? 'Como o WhatsApp do CRM funciona' : 'Seu WhatsApp está quase pronto'}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {hasConversations
              ? 'Resumo do caminho de cada conversa e do que ainda falta configurar.'
              : 'Ainda não chegou nenhuma conversa. Siga os passos abaixo; quando alguém chamar, a conversa aparece aqui.'}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-50">
            Fechar guia
          </button>
        )}
      </div>

      <Flow settings={settings} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-[15px] font-semibold text-slate-800">Primeiros passos</h3>
          <span className="text-sm text-slate-500" role="status">
            {doneCount} de {required.length} prontos
          </span>
          <div className="h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <ul className="flex flex-col gap-2">
          {items.map((it) => {
            const isNext = next?.id === it.id
            return (
              <li
                key={it.id}
                className={`flex gap-3 rounded-xl border p-4 ${isNext ? 'border-brand-500/60 bg-brand-500/5' : 'border-slate-200'}`}
                aria-current={isNext ? 'step' : undefined}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${it.done ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300'}`}
                  aria-hidden="true"
                >
                  {it.done && <Check size={14} strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${it.done ? 'text-slate-500' : 'text-slate-800'}`}>
                    <span className="sr-only">{it.done ? 'Feito: ' : it.optional ? 'Opcional, não feito: ' : 'Falta: '}</span>
                    {it.title}
                    {it.optional && !it.done && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500" aria-hidden="true">opcional</span>}
                    {isNext && <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">próximo</span>}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{it.text}</p>
                  {!it.done && it.action && <p className="mt-2 text-[13px]">{it.action}</p>}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <details className="group rounded-xl border border-slate-200">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700">
          <FileText size={15} className="text-slate-400" aria-hidden="true" />
          O que é "mensagem de modelo"?
        </summary>
        <div className="space-y-2 px-4 pb-4 text-[13px] leading-relaxed text-slate-500">
          <p>É uma mensagem pronta que o Meta aprova antes, tipo "Oi {'{{1}}'}, tudo bem? Vi que você se interessou pela Arrow Shot...". As partes com {'{{1}}'}, {'{{2}}'} são trocadas pelo nome, produto ou link na hora de enviar.</p>
          <p>Ela é obrigatória em 3 casos: para chamar alguém que nunca falou com o número, para o follow-up que sai depois de 24h sem resposta, e para o WhatsApp do carrinho abandonado. A aprovação costuma levar de minutos a algumas horas. Depois de aprovado, clique em "Atualizar modelos" nas Configurações.</p>
        </div>
      </details>
    </section>
  )
}
