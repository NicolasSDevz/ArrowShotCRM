// Erros do WhatsApp (Meta) e do CRM explicados em português: o que quer dizer e o que fazer.
//
// level:
//   'account' = problema da conta inteira (pagamento, token, bloqueio). Avisa a equipe
//               e, se block = true, pausa os disparos em andamento.
//   'person'  = problema só daquele número (sem WhatsApp, não quer marketing...).
//   'temp'    = falha passageira: dá para reenviar depois.
// retry = vale reenviar para essa pessoa quando o problema for resolvido.

export const WA_ERRORS = {
  131042: {
    title: 'Problema no pagamento do WhatsApp',
    why: 'O Meta recusou a mensagem porque a forma de pagamento da conta do WhatsApp foi recusada, venceu ou não está cadastrada. Mensagem de modelo é paga.',
    fix: 'Abra business.facebook.com > Configurações > Pagamentos (ou WhatsApp Manager > Configurações de pagamento), atualize o cartão e pague o que estiver em aberto. Depois clique em "Reenviar para quem não recebeu".',
    level: 'account',
    block: true,
    retry: true,
    match: /payment issue|eligibility payment/i,
  },
  131031: {
    title: 'Conta do WhatsApp bloqueada pelo Meta',
    why: 'O Meta travou a conta, por violação de política ou porque falta verificar a empresa.',
    fix: 'Abra o WhatsApp Manager e veja o aviso da conta. Se for verificação, conclua em Configurações do negócio > Central de segurança.',
    level: 'account',
    block: true,
    retry: true,
    match: /account has been locked/i,
  },
  190: {
    title: 'Token do WhatsApp venceu',
    why: 'A chave que o CRM usa para falar com o WhatsApp venceu ou foi revogada.',
    fix: 'Gere um token novo de usuário do sistema (validade Nunca) e cadastre em Leads > Conversas > Configurar > Conexão.',
    level: 'account',
    block: true,
    retry: true,
    match: /access token|session has expired|token do WhatsApp venceu/i,
  },
  131048: {
    title: 'Número limitado por spam',
    why: 'Muita gente bloqueou ou denunciou as mensagens, e o Meta limitou o envio do número.',
    fix: 'Pare os disparos por pelo menos 24 horas. Depois mande só para quem espera a mensagem (leads recentes) e use textos menos insistentes.',
    level: 'account',
    block: true,
    retry: false,
    match: /spam rate limit/i,
  },
  132015: {
    title: 'Modelo pausado pelo Meta',
    why: 'O modelo teve muitas reações negativas (bloqueios, denúncias) e o Meta pausou o uso dele.',
    fix: 'Use outro modelo ou edite esse no WhatsApp Manager. A pausa costuma durar algumas horas na primeira vez.',
    level: 'account',
    block: true,
    retry: true,
    match: /template is paused|modelo foi pausado/i,
  },
  132016: {
    title: 'Modelo desativado pelo Meta',
    why: 'O modelo foi pausado várias vezes e o Meta desativou de vez.',
    fix: 'Crie um modelo novo, com outro texto, e espere a aprovação.',
    level: 'account',
    block: true,
    retry: true,
    match: /template is disabled|modelo foi desativado/i,
  },
  130429: {
    title: 'Envio rápido demais',
    why: 'O número passou do limite de mensagens por segundo do Meta.',
    fix: 'Não precisa fazer nada além de reenviar depois. O disparo segue mais devagar.',
    level: 'temp',
    retry: true,
    match: /rate limit hit|throughput/i,
  },
  131049: {
    title: 'Meta segurou a mensagem',
    why: 'Essa pessoa já recebeu muitas mensagens de marketing de empresas nos últimos dias, e o Meta segurou a sua para ela não ser incomodada.',
    fix: 'Nada a fazer agora. Tente de novo com essa pessoa daqui a alguns dias, de preferência com outro texto.',
    level: 'person',
    retry: false,
    match: /healthy ecosystem/i,
  },
  130472: {
    title: 'Número em teste do Meta',
    why: 'O Meta escolheu esse número para um teste em que ele não recebe mensagens de marketing.',
    fix: 'Não tem como mandar marketing para ele. Fale por outro canal ou espere ele chamar você.',
    level: 'person',
    retry: false,
    match: /part of an experiment/i,
  },
  131026: {
    title: 'Número sem WhatsApp',
    why: 'O número não tem WhatsApp, está errado ou usa um WhatsApp muito antigo.',
    fix: 'Confira o número do lead no CRM.',
    level: 'person',
    retry: false,
    match: /não recebeu a mensagem|undeliverable|unable to deliver/i,
  },
  131050: {
    title: 'Pessoa não quer receber marketing',
    why: 'A pessoa desativou as mensagens de marketing da Arrow Shot no WhatsApp dela.',
    fix: 'Não mande mais marketing para ela. Se ela chamar, dá para responder normalmente.',
    level: 'person',
    retry: false,
    match: /stopped marketing|opted out/i,
  },
  131056: {
    title: 'Mensagens demais para o mesmo número',
    why: 'Saíram muitas mensagens seguidas para essa pessoa.',
    fix: 'Espere um pouco antes de mandar de novo.',
    level: 'temp',
    retry: true,
    match: /muitas mensagens seguidas|pair rate limit/i,
  },
  131047: {
    title: 'Passou de 24 horas',
    why: 'Fora da janela de 24 horas só dá para mandar mensagem de modelo.',
    fix: 'Use um modelo aprovado.',
    level: 'person',
    retry: false,
    match: /passou de 24h|re-engagement/i,
  },
  131053: {
    title: 'Imagem ou vídeo do topo não carregou',
    why: 'O WhatsApp não conseguiu baixar a mídia do topo do modelo.',
    fix: 'Troque o link da imagem/vídeo do disparo por um link público (que abra sem login).',
    level: 'account',
    block: false,
    retry: true,
    match: /media upload error|media download/i,
  },
  132000: {
    title: 'Variáveis não batem com o modelo',
    why: 'A quantidade de variáveis enviada é diferente da que o modelo pede.',
    fix: 'Confira as partes do modelo no disparo.',
    level: 'account',
    block: false,
    retry: true,
    match: /variáveis não bate|number of parameters/i,
  },
  132001: {
    title: 'Modelo não encontrado',
    why: 'O modelo não existe ou não foi aprovado nesse idioma.',
    fix: 'Clique em "Atualizar modelos" e escolha um modelo aprovado.',
    level: 'account',
    block: false,
    retry: true,
    match: /modelo não existe|template name does not exist/i,
  },
  131000: {
    title: 'Erro do próprio WhatsApp',
    why: 'Falha passageira nos servidores do Meta.',
    fix: 'Reenviar mais tarde.',
    level: 'temp',
    retry: true,
    match: /something went wrong|service unavailable/i,
  },
  opt_out: {
    title: 'Pediu para não receber',
    why: 'A pessoa tocou em "Bloquear" ou "Não quero" num modelo antes, então o CRM não manda mais disparo para ela.',
    fix: 'Nada a fazer. Se ela chamar, dá para responder normalmente.',
    level: 'person',
    retry: false,
    match: /pediu para não receber/i,
  },
  crm_db: {
    title: 'CRM fora do ar no envio',
    why: 'O banco do CRM (Firebase) estava sem cota ou com o pagamento suspenso. A mensagem pode ter saído mesmo assim, mas o CRM não registrou.',
    fix: 'Confira o faturamento do Firebase. Antes de reenviar, veja na conversa se a pessoa já recebeu.',
    level: 'temp',
    retry: false,
    match: /quota exceeded|RESOURCE_EXHAUSTED|Firestore/i,
  },
}

const OTHER = { title: 'Outro erro', why: '', fix: 'Veja o texto do erro na lista de pessoas.', level: 'person', retry: false }

/** Acha a explicação pelo código do Meta ou, sem código, pelo texto do erro. */
export function classifyWaError(code, text = '') {
  const n = Number(code)
  if (n && WA_ERRORS[n]) return { key: `c${n}`, code: n, ...WA_ERRORS[n] }
  for (const [k, v] of Object.entries(WA_ERRORS)) {
    if (v.match && v.match.test(String(text || ''))) return { key: /^\d+$/.test(k) ? `c${k}` : k, code: /^\d+$/.test(k) ? Number(k) : 0, ...v }
  }
  return { key: n ? `c${n}` : 'other', code: n || 0, ...OTHER, why: String(text || '').slice(0, 200) }
}

/** Só o que vai para o banco (sem regex). */
export function publicInfo(info) {
  return { title: info.title, why: info.why, fix: info.fix, level: info.level, retry: Boolean(info.retry), code: info.code || 0 }
}
