import toast from 'react-hot-toast'

/** Erro pronto pra mostrar ao usuário: um título, uma explicação em
 *  português e (se houver) o texto técnico original, pra copiar pro suporte. */
export interface FriendlyError {
  title: string
  message: string
  details?: string
}

type Listener = (e: FriendlyError) => void
const listeners = new Set<Listener>()

/** Usado pelo ErrorDialogHost (montado uma vez no App). */
export function onErrorDialog(fn: Listener) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function openErrorDialog(e: FriendlyError) {
  if (listeners.size === 0) {
    toast.error(e.message)
    return
  }
  listeners.forEach((fn) => fn(e))
}

const RULES: { test: RegExp; title: string; message: string }[] = [
  {
    test: /DEVELOPER_TOKEN|developer.?token/i,
    title: 'Google Ads: token de desenvolvedor',
    message: 'O token de desenvolvedor do Google Ads ainda não foi aprovado ou está inválido. Enquanto isso, os dados do Google Ads não carregam.',
  },
  {
    test: /USER_PERMISSION_DENIED|PERMISSION_DENIED|does ?n.t have permission|not authorized to access|CUSTOMER_NOT_ENABLED/i,
    title: 'Google Ads: sem permissão nessa conta',
    message:
      'A conta de acesso da agência não tem permissão nessa conta do Google Ads (ou a conta está desativada). Peça ao cliente pra dar acesso, ou vincule a conta à conta gerenciadora (MCC) da agência.',
  },
  {
    test: /CUSTOMER_NOT_FOUND|INVALID_CUSTOMER_ID|customer.?id|login-customer-id/i,
    title: 'Google Ads: ID da conta',
    message: 'O ID da conta do Google Ads parece errado. Confira o número de 10 dígitos que aparece no canto superior direito do Google Ads.',
  },
  {
    test: /UNAUTHENTICATED|invalid_grant|refresh.?token|token (has )?expired|OAUTH/i,
    title: 'Conexão com o Google expirou',
    message: 'O acesso ao Google precisa ser renovado (o token expirou ou foi revogado). Gere um novo acesso e tente de novo.',
  },
  {
    test: /RESOURCE_EXHAUSTED|quota|rate.?limit|too many requests|429/i,
    title: 'Limite de consultas atingido',
    message: 'O serviço limitou as consultas por agora. Espere alguns minutos e tente de novo.',
  },
  {
    test: /Failed to fetch|NetworkError|network|timeout|timed out|Tempo de|demorou demais/i,
    title: 'Falha de conexão',
    message: 'Não foi possível falar com o servidor. Verifique a internet e tente de novo.',
  },
  {
    test: /permission-denied|Missing or insufficient permissions/i,
    title: 'Sem permissão',
    message: 'Seu usuário não tem permissão pra fazer isso. Se precisar, peça ao administrador.',
  },
]

/** Parece erro técnico (de API, JSON, código do Google…)? Esses vão pro
 *  pop-up; mensagens curtas e já em português continuam no aviso. */
function looksTechnical(msg: string) {
  return msg.length > 110 || /[{}[\]]|https?:\/\/|\b[A-Z]{3,}_[A-Z_]+\b|status|Google|API|token|Request|Error:|firebase/i.test(msg)
}

export function toFriendlyError(err: unknown, fallback: string): FriendlyError {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const rule = raw ? RULES.find((r) => r.test.test(raw)) : undefined
  if (rule) return { title: rule.title, message: rule.message, details: raw }
  return { title: 'Algo deu errado', message: fallback, details: raw || undefined }
}

/** Mostra um erro do jeito certo: pop-up com explicação quando é erro
 *  técnico (Google, API, JSON…); aviso normal quando é uma mensagem simples. */
export function showError(err: unknown, fallback: string) {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  if (!raw) {
    toast.error(fallback)
    return
  }
  if (!looksTechnical(raw) && !RULES.some((r) => r.test.test(raw))) {
    toast.error(raw)
    return
  }
  openErrorDialog(toFriendlyError(err, fallback))
}
