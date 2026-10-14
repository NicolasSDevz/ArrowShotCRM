import type { Timestamp } from 'firebase/firestore'
import type { BaseDoc } from './common'

/** Loja = checkout próprio + área de membros (nosso "Kiwify").
 *  Valores em dinheiro sempre em CENTAVOS (inteiro). */

export type StoreProductStatus = 'draft' | 'active' | 'archived'

export interface StoreOrderBump {
  productId: string
  headline: string
  description: string
  cta: string
  /** Preço especial da oferta (centavos). Vazio = preço normal do produto. */
  price?: number | null
  /** Animação pra chamar atenção. */
  animation?: StoreBumpAnimation
  /** Onde a oferta aparece no checkout. Vazio = no pagamento (como sempre foi). */
  position?: StoreBumpPosition
}

/** Onde o order bump aparece: no topo (antes dos dados), entre os dados e o pagamento,
 *  no pagamento (padrão), logo acima do botão de comprar ou na coluna lateral. */
export type StoreBumpPosition = 'top' | 'beforePayment' | 'payment' | 'button' | 'side'

export const STORE_BUMP_POSITIONS: { value: StoreBumpPosition; label: string }[] = [
  { value: 'top', label: 'No topo, antes dos dados' },
  { value: 'beforePayment', label: 'Entre os dados e o pagamento' },
  { value: 'payment', label: 'No pagamento, embaixo das formas de pagamento (padrão)' },
  { value: 'button', label: 'Logo acima do total e do botão de comprar' },
  { value: 'side', label: 'Na coluna lateral (no celular vai pra cima do botão)' },
]

export type StoreBumpAnimation = 'none' | 'pulse' | 'glow' | 'shake' | 'bounce' | 'arrow' | 'blink'

export interface StoreTestimonial {
  name: string
  text: string
  photoUrl?: string
}

/** Onde o contador aparece: faixa fixa no topo, acima do formulário,
 *  no topo da coluna lateral ou logo acima do botão de comprar. */
export type StoreCountdownPosition = 'top' | 'form' | 'side' | 'button'
export type StoreDeviceScope = 'all' | 'desktop' | 'mobile'
export type StoreButtonAnimation = 'none' | 'pulse' | 'shine' | 'shake' | 'bounce'

export interface StoreCountdownConfig {
  enabled: boolean
  minutes: number
  text: string
  color: string
  textColor?: string
  position?: StoreCountdownPosition
  /** Posição no celular (lá a coluna lateral fica embaixo de tudo). Vazio = igual ao computador; "Lateral" vira "No formulário". */
  mobilePosition?: Exclude<StoreCountdownPosition, 'side'>
  /** Em qual tela o contador aparece. */
  devices?: StoreDeviceScope
}

/** Selos de confiança prontos (o texto da garantia usa os dias do produto). */
export type StoreSealKey = 'secure' | 'guarantee' | 'satisfaction' | 'instant' | 'privacy' | 'pix' | 'support' | 'lifetime'

export const STORE_SEALS: { key: StoreSealKey; label: string; title: (days: number) => string; text: string }[] = [
  { key: 'guarantee', label: 'Garantia em dias', title: (d) => `Garantia de ${d || 7} dias`, text: 'Se não gostar, devolvemos 100% do seu dinheiro.' },
  { key: 'secure', label: 'Compra segura', title: () => 'Compra 100% segura', text: 'Pagamento protegido e processado com criptografia.' },
  { key: 'satisfaction', label: 'Satisfação garantida', title: () => '100% garantido', text: 'Satisfação garantida ou o seu dinheiro de volta.' },
  { key: 'instant', label: 'Acesso imediato', title: () => 'Acesso imediato', text: 'O acesso chega no seu e-mail assim que o pagamento é aprovado.' },
  { key: 'privacy', label: 'Dados protegidos', title: () => 'Seus dados protegidos', text: 'Suas informações ficam em sigilo e não são compartilhadas.' },
  { key: 'pix', label: 'Pagamento no Pix', title: () => 'Pague no Pix', text: 'Rápido, sem cartão e sem burocracia.' },
  { key: 'support', label: 'Suporte', title: () => 'Suporte direto', text: 'Fale com a nossa equipe sempre que tiver dúvida.' },
  { key: 'lifetime', label: 'Acesso vitalício', title: () => 'Acesso vitalício', text: 'Assista quando quiser, quantas vezes quiser.' },
]

/** Selos marcados. Produto antigo (sem a lista) mostra só a garantia, como antes. */
export function checkoutSeals(design: StoreCheckoutDesign | undefined, guaranteeDays: number): StoreSealKey[] {
  if (design?.seals) return design.seals
  return guaranteeDays > 0 ? ['guarantee'] : []
}

/** Título e texto de um selo, com o que foi escrito no produto por cima do padrão. */
export function sealCopy(key: StoreSealKey, design: StoreCheckoutDesign | undefined, guaranteeDays: number) {
  const base = STORE_SEALS.find((x) => x.key === key)
  const own = design?.sealTexts?.[key]
  const legacyTitle = key === 'guarantee' ? design?.guaranteeTitle : undefined
  const legacyText = key === 'guarantee' ? design?.guaranteeText : undefined
  return {
    title: own?.title || legacyTitle || base?.title(guaranteeDays) || '',
    text: own?.text || legacyText || base?.text || '',
  }
}

export interface StoreCheckoutDesign {
  /** Selos de confiança marcados, na ordem em que aparecem. */
  seals?: StoreSealKey[]
  /** Título e texto próprios de cada selo (vazio = padrão). */
  sealTexts?: Partial<Record<StoreSealKey, { title?: string; text?: string }>>
  /** Selos escritos à mão (além dos prontos). */
  customSeals?: string[]
  /** Onde os selos aparecem: cartões na coluna lateral, etiquetas embaixo do botão ou os dois. Padrão: lateral. */
  sealsPosition?: 'button' | 'side' | 'both'
  /** Selos em linha (etiquetas pequenas) ou em grade (com ícone grande). */
  sealsStyle?: 'row' | 'grid'
  /** Cartão de garantia: título e texto próprios (vazio = padrão). */
  guaranteeTitle?: string
  guaranteeText?: string
  cardColor?: string
  textColor?: string
  buttonTextColor?: string
  buttonAnimation?: StoreButtonAnimation
  /** Cantos dos cartões e botões. */
  radius?: 'square' | 'soft' | 'round'
  titleAlign?: 'left' | 'center'
  /** Cor própria de cada parte do checkout. Vazio = segue a cor principal (ou a do texto). */
  colors?: StoreCheckoutColors
  desktop?: {
    /** Largura da página no computador. */
    width?: 'narrow' | 'normal' | 'wide'
    /** Coluna lateral (benefícios, garantia, depoimentos): à direita, à esquerda ou embaixo do formulário. */
    side?: 'right' | 'left' | 'below'
    hideHeader?: boolean
  }
  mobile?: {
    /** Banner próprio pro celular (vazio = usa o do computador). */
    headerImageUrl?: string | null
    hideHeader?: boolean
    /** Coluna lateral antes do formulário no celular. */
    sideFirst?: boolean
    hideSideImages?: boolean
    hideTestimonials?: boolean
    /** Botão "Comprar" fixo no rodapé da tela enquanto rola. */
    stickyButton?: boolean
  }
}

export interface StoreCheckoutColors {
  /** Botão de pagar (e o botão fixo do celular). */
  button?: string
  /** Preço no topo. */
  price?: string
  /** Títulos dos cartões (Seus dados, Pagamento...). */
  title?: string
  /** Ícones dos selos e dos benefícios. */
  icon?: string
  /** Borda da forma de pagamento escolhida (Pix / Cartão). */
  method?: string
  /** Order bump: borda e chamada. */
  bumpBorder?: string
  /** Order bump: fundo da caixa. */
  bumpBg?: string
  /** Order bump: texto (nome, descrição e preço). */
  bumpText?: string
  /** Order bump: faixa da caixinha de marcar. */
  bumpCtaBg?: string
  bumpCtaText?: string
}

export interface StoreCheckoutConfig {
  primaryColor: string
  backgroundColor: string
  font: string
  headerImageUrl?: string | null
  headline?: string
  subheadline?: string
  countdown: StoreCountdownConfig
  /** Visual extra e ajustes por dispositivo (tudo opcional; vazio = padrão). */
  design?: StoreCheckoutDesign
  sideImages: string[]
  benefits: string[]
  testimonials: StoreTestimonial[]
  guaranteeDays: number
  askPhone: boolean
  askCpf: boolean
  confirmEmail: boolean
  buttonText: string
  fbPixelId?: string | null
  /** API de Conversões ligada (precisa do token do pixel salvo). Padrão: ligada. */
  capiEnabled?: boolean
  /** Código de Eventos de teste do Gerenciador (só enquanto testa; apague depois). */
  capiTestCode?: string | null
  /** Quando o código de teste foi colocado: o servidor só usa por 3 h (esquecido, as vendas reais não contariam). */
  capiTestCodeAt?: string | null
  thankYouUrl?: string | null
  footerText?: string
  bumps: StoreOrderBump[]
}

export interface StoreMembersConfig {
  bannerUrl?: string | null
  coverUrl?: string | null
  logoUrl?: string | null
  primaryColor: string
  welcomeTitle?: string
  welcomeText?: string
  commentsEnabled: boolean
  commentsNeedApproval: boolean
  certificateEnabled: boolean
  /** Carga horária impressa no certificado. */
  certificateHours?: number
  producerName?: string
  /** Aparece bloqueado (com botão de comprar) para alunos que ainda não compraram. Padrão: sim. */
  showInCatalog?: boolean
  /** Para onde vai o botão Comprar da vitrine (vazio = checkout do produto). */
  salesUrl?: string | null
}

export interface StoreProduct extends BaseDoc {
  name: string
  slug: string
  status: StoreProductStatus
  description: string
  imageUrl?: string | null
  price: number
  comparePrice?: number | null
  maxInstallments: number
  paymentMethods: { pix: boolean; card: boolean }
  /** Desconto (%) sobre o total quando paga no Pix. 0 = sem desconto. */
  pixDiscountPercent?: number
  /** Conta Pix (direto na conta) deste produto. Vazio = conta principal. */
  pixAccountId?: string | null
  /** Conta do Mercado Pago que recebe o Pix e o cartão deste produto. Vazio = conta principal (Vercel). */
  mpAccountId?: string | null
  supportEmail?: string | null
  statementDescriptor?: string | null
  /** Sem Mercado Pago configurado, deixa comprar sem cobrar (para testar o fluxo). */
  testMode: boolean
  checkout: StoreCheckoutConfig
  members: StoreMembersConfig
  /** Total de aulas (mantido pelo editor de conteúdo) — usado no % dos alunos. */
  lessonCount?: number
  /** Produto privado: só esta pessoa (uid) vê o produto, as vendas, os cupons e os
   *  carrinhos abandonados dele, e só ela recebe os avisos. null = toda a equipe vê.
   *  Muda só pelo servidor (storeSetPrivate), que leva junto pedidos e cupons. */
  privateTo?: string | null
  /** Área de membros onde o curso aparece. Vazio = área principal (/membros). */
  membersAreaId?: string | null
  /** Reembolso automático: o aluno pede dentro da garantia e o dinheiro volta na hora
   *  (só cartão e Pix do Mercado Pago; Pix direto na conta continua manual). */
  autoRefund?: boolean
}

export interface StoreModule {
  id: string
  title: string
  order: number
  coverUrl?: string | null
  /** Libera N dias depois da compra (0 = na hora). */
  releaseDays: number
  createdAt?: Timestamp
}

export interface StoreAttachment {
  name: string
  url: string
  /** PDF protegido: o link fica cifrado em `sealed` (url vazio) e o download carimba nome/CPF do aluno. */
  protected?: boolean
  sealed?: { ciphertext: string; iv: string; authTag: string } | null
  /** PDF protegido: false = só lê na área de membros (sem botão Baixar). Vazio = pode baixar. */
  allowDownload?: boolean
}

/** Tipo de aula: o que aparece no lugar do player. Vazio = vídeo (aulas antigas). */
export type StoreLessonKind = 'video' | 'text' | 'pdf' | 'link'

export const STORE_LESSON_KINDS: { value: StoreLessonKind; label: string; hint: string }[] = [
  { value: 'video', label: 'Vídeo', hint: 'YouTube, Vimeo, Panda, Bunny ou .mp4' },
  { value: 'text', label: 'Texto', hint: 'Aula escrita, com títulos, listas e imagens' },
  { value: 'pdf', label: 'PDF', hint: 'O PDF abre dentro da aula (Drive, Dropbox ou link direto)' },
  { value: 'link', label: 'Links', hint: 'Botões para materiais externos (Notion, Canva, planilhas)' },
]

export interface StoreLessonLink {
  label: string
  url: string
}

export interface StoreLesson {
  id: string
  moduleId: string
  title: string
  order: number
  kind?: StoreLessonKind
  videoUrl?: string | null
  /** Aula de texto (Markdown). */
  body?: string
  /** Aula de PDF: link do arquivo (abre dentro da aula). */
  pdfUrl?: string | null
  /** Aula de links: botões para materiais externos. */
  links?: StoreLessonLink[]
  description?: string
  attachments: StoreAttachment[]
  durationMin?: number | null
  releaseDays: number
  createdAt?: Timestamp
}

export type StoreOrderStatus = 'pending' | 'approved' | 'refused' | 'refunded'

export interface StoreOrderItem {
  productId: string
  name: string
  price: number
  fullPrice: number
  bump: boolean
}

export interface StoreOrder {
  id: string
  productId: string
  productName: string
  items: StoreOrderItem[]
  productIds: string[]
  amount: number
  couponCode?: string | null
  couponPercent?: number
  pixDiscountPercent?: number
  pixDiscountAmount?: number
  pixAccountLabel?: string
  refundRequest?: { reason: string; requestedAt: string; deniedAt?: string; deniedBy?: string }
  buyer: { name: string; email: string; phone?: string | null; cpf?: string | null }
  method: 'pix' | 'pix_manual' | 'card' | 'test' | 'free'
  confirmedBy?: string
  installments?: number
  status: StoreOrderStatus
  mpPaymentId?: string
  mpStatus?: string
  mpStatusDetail?: string | null
  test?: boolean
  memberUid?: string
  accessUrl?: string
  emailSent?: boolean
  utm?: Record<string, string>
  invoice?: StoreInvoice
  createdAt: string
  approvedAt?: string
  refundedAt?: string
  refundedBy?: string
  /** Conta do Mercado Pago em que o pedido foi cobrado (vazio = principal). */
  mpAccountId?: string | null
  /** Copiado do produto: pedido de produto privado (ver StoreProduct.privateTo). */
  privateTo?: string | null
  /** Pix direto que ninguém confirmou em 7 dias (ainda dá pra confirmar se o dinheiro caiu). */
  expiredAt?: string
  /** Resultado do envio da venda pela API de Conversões do Meta. */
  capi?: { purchase?: { ok: boolean; error?: string; attempts?: number; at?: string } }
}

export interface StoreCoupon extends BaseDoc {
  code: string
  percent: number
  productId?: string | null
  active: boolean
  maxUses?: number | null
  uses?: number
  expiresAt?: string | null
  /** Cupom de produto privado (some para o resto da equipe). */
  privateTo?: string | null
}

/** Carrinho abandonado: a pessoa preencheu nome e contato no checkout e não pagou.
 *  storeAbandoned/{productId}_{hash do e-mail}. Some quando a compra é aprovada. */
export interface StoreAbandoned {
  id: string
  productId: string
  productName: string
  name: string
  email: string
  phone?: string | null
  /** Valor que estava no carrinho (centavos). */
  amount: number
  utm?: Record<string, string>
  /** Chegou a gerar um pedido (Pix sem pagar, cartão recusado). */
  orderId?: string | null
  orderStatus?: StoreOrderStatus | null
  createdAt: string
  updatedAt: string
  /** Comprou depois: fica registrado como recuperado. */
  recoveredAt?: string | null
  /** A equipe marcou como contatado (WhatsApp/e-mail). */
  contactedAt?: string | null
  contactedBy?: string | null
  privateTo?: string | null
}

export interface StoreMember {
  id: string
  email: string
  name: string
  phone?: string | null
  hasPassword: boolean
  /** Entrou (ou vai entrar) com senha provisória: precisa criar a dele. */
  mustChangePassword?: boolean
  /** Até quando vale a senha provisória (ISO). */
  tempPasswordUntil?: string | null
  createdAt: string
  lastAccessAt?: string | null
}

export interface StoreEnrollment {
  id: string
  uid: string
  email: string
  productId: string
  orderId?: string | null
  source: 'compra' | 'manual' | 'equipe'
  active: boolean
  createdAt: string
}

export interface StoreProgress {
  id: string
  uid: string
  productId: string
  completed: string[]
  lastLessonId?: string | null
  ratings?: Record<string, number>
  updatedAt?: Timestamp
}

export interface StoreComment {
  id: string
  productId: string
  lessonId: string
  lessonTitle?: string
  uid: string
  authorName: string
  text: string
  status: 'approved' | 'pending'
  isProducer: boolean
  parentId?: string | null
  createdAt: Timestamp
}

/** Nota fiscal do pedido (Focus NFe). */
export interface StoreInvoice {
  status: 'processando' | 'autorizado' | 'erro' | 'cancelado'
  ref?: string
  attempt?: number
  numero?: string | null
  pdfUrl?: string | null
  xmlUrl?: string | null
  error?: string | null
  cancelError?: string
  emailSent?: boolean
  environment?: 'homologacao' | 'producao'
}

/** storeSettings/invoice — dados fiscais para a NFS-e (o token fica no servidor). */
export interface StoreInvoiceSettings {
  enabled: boolean
  environment: 'homologacao' | 'producao'
  cnpj: string
  inscricaoMunicipal: string
  /** Código IBGE do município da empresa (7 dígitos). */
  codigoMunicipio: string
  /** Item da lista de serviço da LC 116 (ex.: 0802 = treinamento). */
  itemListaServico: string
  codigoTributarioMunicipio?: string
  codigoCnae?: string
  aliquota: number
  simplesNacional: boolean
  naturezaOperacao?: number
  /** Texto da nota. Aceita {produtos}, {pedido} e {cliente}. */
  discriminacao: string
}

/** storeMpAccounts/{id} — conta extra do Mercado Pago (o token fica cifrado no servidor). */
export interface StoreMpAccount {
  id: string
  label: string
  publicKey: string
  /** Conta conferida no Mercado Pago quando o token foi salvo. */
  mpUserId?: string
  mpNickname?: string
  mpEmail?: string
  /** Avançado: Pix direto no banco desta conta (sem taxa; alguém confirma à mão). Ligado, passa por cima do Pix do MP. */
  pixDirect?: StorePixDirect | null
  privateTo?: string | null
  createdAt?: string
  updatedAt?: string
  updatedBy?: string
}

export interface StorePixDirect {
  enabled: boolean
  pixKeyType: PixKeyType
  pixKey: string
  pixName: string
  pixCity: string
}

/** storeSettings/payments — Pix direto na conta (ex.: Nubank), sem taxa. */
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'phone' | 'evp'

export interface StorePaymentSettings {
  pixManual: boolean
  pixKey: string
  pixKeyType: PixKeyType
  /** Nome do titular da conta (aparece no app do banco de quem paga). */
  pixName: string
  pixCity: string
  /** WhatsApp para o comprador mandar o comprovante (só números, com DDD). */
  whatsapp?: string
  /** Contas Pix extras; cada produto escolhe em qual conta cai (vazio = principal). */
  pixAccounts?: StorePixAccount[]
  /** Nome da conta principal do Mercado Pago (a da Vercel), ex.: "Nicolas". Vazio = "Conta principal". */
  mpPrincipalLabel?: string
  /** Conta principal (Vercel) desligada no CRM: as vendas novas ignoram as chaves da Vercel. */
  mpPrincipalDisabled?: boolean
  /** Conta de recebimento padrão: a que os produtos novos usam e que aparece primeiro.
   *  Id de uma conta extra (storeMpAccounts) ou vazio = a da Vercel. */
  defaultMpAccountId?: string | null
}

export interface StorePixAccount {
  id: string
  /** Apelido para reconhecer no CRM (ex.: "Inter", "Conta do Bruno"). */
  label: string
  pixKey: string
  pixKeyType: PixKeyType
  pixName: string
  pixCity: string
}

export const PIX_KEY_TYPE_LABEL: Record<PixKeyType, string> = {
  cnpj: 'CNPJ',
  cpf: 'CPF',
  email: 'E-mail',
  phone: 'Celular',
  evp: 'Chave aleatória',
}

/** storeSettings/membersTheme — visual da área de membros e da tela de login. */
export interface StoreMembersTheme {
  brandName: string
  logoUrl?: string | null
  mode: 'dark' | 'light'
  primaryColor: string
  backgroundColor?: string | null
  cardColor?: string | null
  font: string
  loginLayout: 'center' | 'split'
  /** Visual só da tela de login (vazio = igual à área de membros). */
  loginMode?: 'dark' | 'light' | null
  loginPrimaryColor?: string | null
  loginBackgroundColor?: string | null
  loginCardColor?: string | null
  loginLogoUrl?: string | null
  /** Escurecer a imagem de fundo do login (0 a 80%). */
  loginOverlay?: number
  loginBgUrl?: string | null
  loginTitle: string
  loginText?: string
  loginButtonText: string
  loginHelpText?: string
  supportWhatsapp?: string

  /* --- Início da área (banner principal: é da área, não de um produto) --- */
  /** Banner do topo do Início. Vazio = banner do primeiro curso do aluno (como antes). */
  homeBannerUrl?: string | null
  /** Banner só do celular (vazio = o de cima). */
  homeBannerMobileUrl?: string | null
  /** Título e texto do banner. Vazio = os do curso em destaque. */
  homeTitle?: string
  homeText?: string
  /** Botão do banner: abre o curso em destaque. Texto vazio = "Começar"/"Continuar". */
  homeButtonText?: string
  /** Mostrar o "Olá, Maria!" em cima do título. Padrão: sim. */
  homeGreeting?: boolean
  homeBannerHeight?: 'small' | 'medium' | 'large'
  /** Escurecer o banner (0 a 80%). */
  homeOverlay?: number
  /** Título e texto alinhados à esquerda ou no centro do banner. */
  homeAlign?: 'left' | 'center'

  /* --- Cursos --- */
  /** Formato das capas: vertical (estilo Netflix), quadrada ou deitada. */
  cardShape?: 'portrait' | 'square' | 'landscape'
  /** Barrinha de progresso embaixo de cada capa. Padrão: sim. */
  cardProgress?: boolean
  /** Títulos das seções do Início (vazio = padrão). */
  continueTitle?: string
  coursesTitle?: string
  catalogTitle?: string
  /** Mostrar os outros cursos desta área bloqueados, com botão de comprar. Padrão: sim. */
  showCatalog?: boolean

  /* --- Cores e acabamento extras --- */
  /** Cor dos textos (vazio = a do modo claro/escuro). */
  textColor?: string | null
  /** Cor do topo (menu). Vazio = fundo da área. */
  headerColor?: string | null
  /** Cantos de botões e capas. */
  radius?: 'square' | 'soft' | 'round'
  /** Texto do rodapé (ex.: CNPJ, contato). */
  footerText?: string
}

/** Área de membros extra (storeMemberAreas/{id}): visual próprio, endereço próprio
 *  (/m/{slug}) e só os cursos ligados a ela. A principal continua em
 *  storeSettings/membersTheme, no endereço /membros. */
export interface StoreMemberArea extends StoreMembersTheme {
  id: string
  /** Nome interno (só no CRM). */
  name: string
  /** Final do endereço: /m/{slug}. */
  slug: string
  /** Área privada: só esta pessoa vê no CRM (como os produtos privados). */
  privateTo?: string | null
  createdBy?: string
  updatedBy?: string
}

export const MAIN_MEMBERS_AREA = 'principal'

/** Quem pode usar o "Só eu vejo" (e-mail do login no CRM). O servidor (api/_lib/store/core.js)
 *  e as regras do Firestore (canUsePrivate) conferem a mesma lista. */
export const PRIVATE_OWNER_EMAILS = ['gestorarrowshot@gmail.com']

export function canUsePrivate(email?: string | null) {
  return PRIVATE_OWNER_EMAILS.includes(String(email || '').toLowerCase())
}

/** Caminho base de uma área: a principal fica em /membros, as outras em /m/{slug}. */
export function membersBasePath(slug?: string | null) {
  return slug ? `/m/${slug}` : '/membros'
}

export function defaultMembersTheme(): StoreMembersTheme {
  return {
    brandName: 'Área de Membros',
    logoUrl: null,
    mode: 'dark',
    primaryColor: '#2563eb',
    backgroundColor: null,
    cardColor: null,
    font: 'Inter',
    loginLayout: 'center',
    loginBgUrl: null,
    loginTitle: 'Acessar área de membros',
    loginText: '',
    loginButtonText: 'Entrar',
    loginHelpText: 'Primeiro acesso? Use o botão Acessar a área de membros que aparece depois da compra. Lá dentro você cria a sua senha.',
    supportWhatsapp: '',
  }
}

/** Tema efetivo da tela de login: o que foi trocado só no login vale por cima da área. */
export function loginTheme(t: StoreMembersTheme): StoreMembersTheme {
  const ownMode = !!t.loginMode && t.loginMode !== t.mode
  return {
    ...t,
    mode: t.loginMode || t.mode,
    primaryColor: t.loginPrimaryColor || t.primaryColor,
    // Trocou o modo só no login: as cores de fundo da área (feitas pro outro modo) não valem.
    backgroundColor: t.loginBackgroundColor || (ownMode ? null : t.backgroundColor),
    cardColor: t.loginCardColor || (ownMode ? null : t.cardColor),
    logoUrl: t.loginLogoUrl || t.logoUrl,
  }
}

/** Variáveis CSS usadas por todas as telas da área de membros. */
export function membersThemeVars(t: StoreMembersTheme): Record<string, string> {
  const dark = t.mode !== 'light'
  const base = dark
    ? { bg: '#0a0a0a', card: '#171717', card2: '#262626', text: '#f5f5f5', text2: '#d4d4d4', muted: '#a3a3a3', faint: '#737373', border: 'rgba(255,255,255,.1)', border2: 'rgba(255,255,255,.05)', soft: 'rgba(255,255,255,.05)', soft2: 'rgba(255,255,255,.1)' }
    : { bg: '#f8fafc', card: '#ffffff', card2: '#e2e8f0', text: '#0f172a', text2: '#334155', muted: '#64748b', faint: '#94a3b8', border: 'rgba(15,23,42,.12)', border2: 'rgba(15,23,42,.06)', soft: 'rgba(15,23,42,.04)', soft2: 'rgba(15,23,42,.08)' }
  return {
    '--m-bg': t.backgroundColor || base.bg,
    '--m-card': t.cardColor || base.card,
    '--m-card2': base.card2,
    '--m-text': t.textColor || base.text,
    '--m-header': t.headerColor || `color-mix(in srgb, ${t.backgroundColor || base.bg} 90%, transparent)`,
    '--m-radius': t.radius === 'square' ? '4px' : t.radius === 'round' ? '18px' : '10px',
    '--m-text2': base.text2,
    '--m-muted': base.muted,
    '--m-faint': base.faint,
    '--m-border': base.border,
    '--m-border2': base.border2,
    '--m-soft': base.soft,
    '--m-soft2': base.soft2,
    '--m-primary': t.primaryColor || '#2563eb',
    colorScheme: dark ? 'dark' : 'light',
    fontFamily: `'${t.font || 'Inter'}', Inter, system-ui, sans-serif`,
  }
}

export const STORE_FONTS = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Rubik'] as const

export const STORE_ORDER_STATUS_LABEL: Record<StoreOrderStatus, string> = {
  pending: 'Aguardando pagamento',
  approved: 'Aprovado',
  refused: 'Recusado',
  refunded: 'Reembolsado',
}

export const STORE_METHOD_LABEL: Record<StoreOrder['method'], string> = {
  pix: 'Pix (Mercado Pago)',
  pix_manual: 'Pix direto na conta',
  card: 'Cartão',
  test: 'Teste',
  free: 'Gratuito',
}

export function defaultCheckoutConfig(): StoreCheckoutConfig {
  return {
    primaryColor: '#2563eb',
    backgroundColor: '#f1f5f9',
    font: 'Inter',
    headerImageUrl: null,
    headline: '',
    subheadline: 'Acesso imediato após a confirmação do pagamento.',
    countdown: { enabled: false, minutes: 15, text: 'Oferta por tempo limitado', color: '#e55858' },
    sideImages: [],
    benefits: [],
    testimonials: [],
    guaranteeDays: 7,
    askPhone: true,
    askCpf: false,
    confirmEmail: false,
    buttonText: 'Comprar agora',
    fbPixelId: null,
    thankYouUrl: null,
    footerText: '',
    bumps: [],
  }
}

export function defaultMembersConfig(): StoreMembersConfig {
  return {
    bannerUrl: null,
    coverUrl: null,
    logoUrl: null,
    primaryColor: '#2563eb',
    welcomeTitle: '',
    welcomeText: '',
    commentsEnabled: true,
    commentsNeedApproval: false,
    certificateEnabled: true,
    certificateHours: undefined,
    producerName: 'Arrow Shot',
  }
}

/** Imagens efetivas do produto: campo vazio usa a foto do produto. */
export function productImages(p: Pick<StoreProduct, 'imageUrl' | 'members'>) {
  const photo = p.imageUrl || null
  return {
    photo,
    banner: p.members?.bannerUrl || photo,
    cover: p.members?.coverUrl || photo,
  }
}

export function formatCents(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
