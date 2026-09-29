import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

const LAST_UPDATED = '29 de setembro de 2026'

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-700">
      <div className="mx-auto w-full max-w-2xl">
        <header className="mb-8 flex items-center gap-3">
          <img src="/favicon-dark.png" alt="Quiver" className="h-10 w-10 rounded-lg" />
          <span className="font-display text-lg font-semibold text-slate-900">Quiver</span>
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-400">Última atualização: {LAST_UPDATED}</p>
          <div className="mt-6 space-y-4 text-[15px] leading-relaxed">{children}</div>
        </div>

        <footer className="mt-6 text-center text-xs text-slate-400">
          <Link to="/privacidade" className="hover:text-slate-600">
            Política de Privacidade
          </Link>
          <span className="mx-2">·</span>
          <Link to="/termos" className="hover:text-slate-600">
            Termos de Serviço
          </Link>
        </footer>
      </div>
    </div>
  )
}

export function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Política de Privacidade">
      <p>
        A Quiver é uma plataforma de uso interno da agência, criada para organizar
        o atendimento e a gestão de campanhas dos clientes da agência.
      </p>
      <p>
        <strong>Coleta e uso dos dados.</strong> Os dados registrados na plataforma (informações de
        clientes, campanhas, tarefas e relatórios) são utilizados exclusivamente para o trabalho
        interno da agência. Não vendemos, alugamos nem compartilhamos esses dados com terceiros.
      </p>
      <p>
        <strong>APIs do Meta.</strong> A plataforma se conecta às APIs do Meta (Meta Ads / Facebook)
        apenas para consultar métricas e informações das contas de anúncios dos clientes da agência,
        com o único objetivo de acompanhar e gerenciar as campanhas. Nenhuma informação obtida por
        meio dessas APIs é compartilhada com terceiros ou usada para qualquer outra finalidade.
      </p>
      <p>
        <strong>Google Agenda.</strong> Quando um membro da equipe conecta a própria conta Google, a
        plataforma solicita a permissão <em>calendar.events</em> apenas para criar, no Google Agenda
        desse usuário, o evento de uma reunião agendada na Quiver (com link do Google Meet e convite
        para os participantes informados). A plataforma não armazena nem compartilha outros eventos da
        agenda. O acesso é temporário, fica somente no navegador do usuário e pode ser revogado a
        qualquer momento em{' '}
        <a href="https://myaccount.google.com/permissions" className="text-brand-700 underline">
          myaccount.google.com/permissions
        </a>
        .
      </p>
      <p>
        O uso e a transferência, para qualquer outro aplicativo, de informações recebidas das APIs do
        Google seguem a{' '}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="text-brand-700 underline"
        >
          Política de Dados do Usuário dos Serviços de API do Google
        </a>
        , incluindo os requisitos de Uso Limitado.
      </p>
      <p>
        <strong>Acesso.</strong> O acesso à plataforma é restrito aos membros autorizados da equipe,
        mediante autenticação individual.
      </p>
      <p>
        <strong>Contato.</strong> Dúvidas sobre esta política podem ser encaminhadas à equipe da
        Quiver pelos canais internos da agência.
      </p>
    </LegalLayout>
  )
}

export function TermsOfServicePage() {
  return (
    <LegalLayout title="Termos de Serviço">
      <p>
        A Quiver é uma plataforma de uso interno e exclusivo da agência.
      </p>
      <p>
        O acesso e a utilização da plataforma são permitidos somente a membros autorizados da equipe,
        para fins relacionados às atividades da agência, como gestão de clientes,
        campanhas, tarefas e relatórios.
      </p>
      <p>
        É vedado o uso da plataforma por pessoas não autorizadas, bem como o compartilhamento de
        credenciais de acesso ou de informações obtidas por meio dela com terceiros.
      </p>
      <p>
        A Quiver pode atualizar ou descontinuar funcionalidades da plataforma a qualquer momento,
        sem aviso prévio.
      </p>
      <p>
        Dúvidas sobre estes termos podem ser encaminhadas à equipe da Quiver pelos canais
        internos da agência.
      </p>
    </LegalLayout>
  )
}
