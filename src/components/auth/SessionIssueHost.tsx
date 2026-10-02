import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { AlertTriangle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { dismissSessionIssue, onSessionIssue, saveIssueToProfile, type SessionIssue, type SessionIssueKind } from '../../services/sessionDiagnostics'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

const CLEANERS = 'extensões de limpeza (Cookie AutoDelete, Click&Clean, History Eraser) ou programas como CCleaner, Avast Cleanup e Norton'
const BLOCKERS = 'bloqueadores (uBlock Origin, AdBlock, AdGuard, Ghostery, Privacy Badger, DuckDuckGo), a proteção web do antivírus (Kaspersky, Avast, AVG, ESET, Bitdefender, Norton) ou uma VPN'

const TEXT: Record<SessionIssueKind, { title: string; what: string; causes: string[]; fix: string[] }> = {
  'storage-cleared': {
    title: 'O navegador apagou o seu login quando foi fechado',
    what: 'Você estava conectado neste navegador, mas quando ele abriu de novo os dados do CRM tinham sido apagados. Por isso pediu login outra vez.',
    causes: [
      'O Chrome está configurado para "Limpar cookies e dados de sites ao fechar todas as janelas".',
      `Alguma limpeza automática: ${CLEANERS}.`,
      'O CRM foi aberto numa janela anônima.',
      'Se você só entrou de outro computador ou de outro perfil do Chrome, pode ignorar este aviso.',
    ],
    fix: [
      'No Chrome, abra chrome://settings/cookies e desligue "Limpar cookies e dados de sites ao fechar todas as janelas", ou adicione este endereço em "Sites que sempre podem usar cookies".',
      'Na extensão ou programa de limpeza, coloque este endereço na lista de exceções.',
    ],
  },
  'not-restored': {
    title: 'O login salvo não foi encontrado ao abrir o CRM',
    what: 'O CRM sabia que você estava conectado, mas o login guardado pelo navegador sumiu antes de abrir de novo.',
    causes: [`Alguma limpeza apagou só parte dos dados do site: ${CLEANERS}.`, 'Configuração do Chrome que limpa dados de sites ao fechar.'],
    fix: [
      'Coloque este endereço como exceção na extensão ou programa de limpeza.',
      'No Chrome, em chrome://settings/cookies, adicione este endereço em "Sites que sempre podem usar cookies".',
    ],
  },
  'live-removed': {
    title: 'O seu login foi apagado com o CRM aberto',
    what: 'Você estava usando o CRM e, sem clicar em Sair, o login deste navegador deixou de valer.',
    causes: [
      'O Google (que cuida do login do CRM) encerrou o login: senha trocada, conta alterada ou entrada em outro lugar que invalidou esta.',
      `Uma extensão ou programa apagou só o login deste site enquanto você navegava: ${CLEANERS}.`,
    ],
    fix: [
      'Entre de novo. O CRM agora guarda o login de um jeito mais resistente a limpezas parciais do navegador.',
      'Se cair de novo sem ninguém trocar a senha, teste numa janela anônima (Ctrl+Shift+N), onde as extensões ficam desligadas, e mande um print desta janela para o responsável pelo CRM.',
    ],
  },
  revoked: {
    title: 'O servidor encerrou o seu login',
    what: 'O Google (que cuida do login do CRM) avisou que este login não vale mais.',
    causes: ['A senha da conta foi trocada.', 'A conta foi alterada ou desativada por um administrador.'],
    fix: ['Entre de novo com a senha atual. Se continuar acontecendo sem ninguém trocar a senha, avise o responsável pelo CRM.'],
  },
  'token-blocked': {
    title: 'Algo está bloqueando a conexão do CRM com o Google',
    what: 'A internet está funcionando, mas o CRM não consegue renovar o seu login. Ele faz isso sozinho a cada hora e, quando é bloqueado, a sessão cai ou os dados param de carregar.',
    causes: [`Costuma ser: ${BLOCKERS}.`, 'Rede de empresa ou roteador com filtro de sites.'],
    fix: [
      'Teste usar o CRM numa janela anônima (Ctrl+Shift+N). Se lá funcionar, desligue as extensões uma por uma em chrome://extensions até achar a culpada.',
      'No bloqueador ou no antivírus, libere este endereço e os endereços googleapis.com.',
    ],
  },
  'db-blocked': {
    title: 'A conexão com o banco de dados do CRM está sendo bloqueada',
    what: 'A internet está funcionando, mas o CRM tentou várias vezes buscar os seus dados e foi barrado. Parece que desconectou, mas é a conexão sendo cortada.',
    causes: [`Costuma ser: ${BLOCKERS}.`],
    fix: [
      'Teste numa janela anônima (Ctrl+Shift+N). Se lá funcionar, é uma extensão: desligue uma por uma em chrome://extensions.',
      'No bloqueador ou no antivírus, libere este endereço e os endereços googleapis.com.',
    ],
  },
}

/** Pop-up global que explica por que o CRM desconectou (ver sessionDiagnostics). */
export function SessionIssueHost() {
  const { profile } = useAuth()
  const [issue, setIssue] = useState<SessionIssue | null>(null)

  useEffect(() => onSessionIssue(setIssue), [])

  // Guarda no perfil assim que houver alguém logado, pra dar pra conferir depois.
  const uid = profile?.id
  useEffect(() => {
    if (uid && issue) void saveIssueToProfile(uid, issue)
  }, [uid, issue])

  if (!issue) return null
  const t = TEXT[issue.kind]

  return (
    <Modal
      open
      onTop
      onClose={dismissSessionIssue}
      width="max-w-xl"
      title={
        <span className="flex items-center gap-2">
          <AlertTriangle size={18} className="shrink-0 text-amber-500" aria-hidden="true" />
          Por que o CRM desconectou
        </span>
      }
    >
      <div className="flex flex-col gap-4 text-sm text-slate-700">
        <div>
          <h2 className="text-base font-bold text-slate-900">{t.title}</h2>
          <p className="mt-1">{t.what}</p>
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">Causas mais prováveis</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {t.causes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">Como resolver</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {t.fix.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-slate-500">
            Endereço do CRM: <span className="font-mono">{window.location.origin}</span>
          </p>
        </div>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Detalhes técnicos: {issue.kind}
          {issue.detail ? `, ${issue.detail}` : ''}, {format(new Date(issue.at), 'dd/MM/yyyy HH:mm')}. Se precisar de ajuda, mande um print desta
          janela para o responsável pelo CRM.
        </p>
        <div className="flex justify-end">
          <Button onClick={dismissSessionIssue}>Entendi</Button>
        </div>
      </div>
    </Modal>
  )
}
