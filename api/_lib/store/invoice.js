// Nota fiscal de serviço (NFS-e) automática pela Focus NFe (focusnfe.com.br).
//
// Fluxo: venda aprovada → emitInvoice() manda a nota (ref = id do pedido) →
// a prefeitura processa em segundos/minutos → syncInvoice() (chamado pelo
// webhook da Focus, pela tela de Vendas e pelo cron diário) grava o PDF/XML
// no pedido e pede para a Focus mandar a nota por e-mail ao comprador.
//
// Configuração:
//   storeSettings/invoice  (tela Loja > Nota fiscal): ambiente, CNPJ,
//     inscrição municipal, código IBGE do município, item da lista de serviço,
//     código tributário municipal, alíquota, Simples Nacional, texto da nota.
//   storeSecrets/invoice   token da Focus, cifrado (AES-256-GCM, mesma chave
//     dos tokens do Meta). Ninguém lê pelo navegador (firestore.rules).
//   O certificado digital A1 da empresa é enviado no painel da Focus, não aqui.
//
// Antes de ligar em produção, emita em "homologação" (ambiente de testes da
// Focus, nota sem valor fiscal) e confira com o contador.

import { getDoc, setDoc, updateDoc } from '../firebaseAdmin.js'
import { encryptToken, decryptToken } from '../tokenCrypto.js'

const BASE = {
  homologacao: 'https://homologacao.focusnfe.com.br',
  producao: 'https://api.focusnfe.com.br',
}

export async function getInvoiceSettings() {
  const snap = await getDoc('storeSettings/invoice')
  return snap.exists ? snap.data() : {}
}

async function getToken() {
  const snap = await getDoc('storeSecrets/invoice')
  if (!snap.exists) return null
  try {
    return decryptToken(snap.data())
  } catch {
    return null
  }
}

export async function saveInvoiceToken(token, by) {
  await setDoc('storeSecrets/invoice', { ...encryptToken(String(token).trim()), updatedAt: new Date().toISOString(), updatedBy: by })
}

export async function invoiceStatus() {
  const [settings, secret] = await Promise.all([getInvoiceSettings(), getDoc('storeSecrets/invoice')])
  return { enabled: settings.enabled === true, hasToken: secret.exists, environment: settings.environment || 'homologacao' }
}

async function focus(settings, token, method, path, body) {
  const base = BASE[settings.environment === 'producao' ? 'producao' : 'homologacao']
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25_000),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

function errorText(data) {
  if (Array.isArray(data?.erros) && data.erros.length) return data.erros.map((e) => e.mensagem || e.codigo).join('; ')
  return data?.mensagem || data?.codigo || 'Erro desconhecido'
}

/** Data/hora no fuso de Brasília no formato que a Focus espera. */
function brNow() {
  const d = new Date(Date.now() - 3 * 3600_000)
  return `${d.toISOString().slice(0, 19)}-03:00`
}

function fillTemplate(template, order) {
  const items = (order.items || []).map((i) => i.name).join(', ')
  return String(template || 'Acesso ao curso online: {produtos}. Pedido {pedido}.')
    .replace(/\{produtos\}/g, items)
    .replace(/\{pedido\}/g, order.id)
    .replace(/\{cliente\}/g, order.buyer?.name || '')
    .slice(0, 2000)
}

/** Monta a NFS-e no formato da Focus (padrão municipal). */
function buildNfse(settings, order) {
  const doc = String(order.buyer?.cpf || '').replace(/\D/g, '')
  const tomador = {
    razao_social: String(order.buyer?.name || '').slice(0, 115),
    email: order.buyer?.email,
  }
  if (doc.length === 11) tomador.cpf = doc
  else if (doc.length === 14) tomador.cnpj = doc
  if (order.buyer?.phone) tomador.telefone = String(order.buyer.phone).replace(/\D/g, '').slice(-11)

  const servico = {
    aliquota: Number(settings.aliquota) || 0,
    discriminacao: fillTemplate(settings.discriminacao, order),
    iss_retido: false,
    item_lista_servico: String(settings.itemListaServico || '').trim(),
    valor_servicos: Number((order.amount / 100).toFixed(2)),
  }
  if (settings.codigoTributarioMunicipio) servico.codigo_tributario_municipio = String(settings.codigoTributarioMunicipio).trim()
  if (settings.codigoCnae) servico.codigo_cnae = String(settings.codigoCnae).replace(/\D/g, '')

  return {
    data_emissao: brNow(),
    natureza_operacao: Number(settings.naturezaOperacao) || 1,
    optante_simples_nacional: settings.simplesNacional === true,
    prestador: {
      cnpj: String(settings.cnpj || '').replace(/\D/g, ''),
      inscricao_municipal: String(settings.inscricaoMunicipal || '').replace(/\D/g, ''),
      codigo_municipio: String(settings.codigoMunicipio || '').replace(/\D/g, ''),
    },
    tomador,
    servico,
  }
}

function settingsProblem(s) {
  if (!s.cnpj || !s.inscricaoMunicipal || !s.codigoMunicipio || !s.itemListaServico) {
    return 'Configuração da nota incompleta (CNPJ, inscrição municipal, município e item de serviço)'
  }
  return null
}

/** Pede a nota de um pedido aprovado. Nunca lança: erro fica gravado no pedido. */
export async function emitInvoice(orderId, { force = false } = {}) {
  const snap = await getDoc(`storeOrders/${orderId}`)
  if (!snap.exists) return null
  const order = { id: orderId, ...snap.data() }
  const settings = await getInvoiceSettings()
  if (!force && settings.enabled !== true) return null
  if (order.status !== 'approved' || order.test || !(order.amount > 0)) return null
  if (order.invoice && ['processando', 'autorizado'].includes(order.invoice.status) && !force) return order.invoice

  const save = async (invoice) => {
    const full = { ...invoice, environment: settings.environment || 'homologacao', updatedAt: new Date().toISOString() }
    await updateDoc(`storeOrders/${orderId}`, { invoice: full })
    return full
  }

  const problem = settingsProblem(settings)
  if (problem) return save({ status: 'erro', error: problem })
  const token = await getToken()
  if (!token) return save({ status: 'erro', error: 'Token da Focus NFe não cadastrado' })

  // Reemissão depois de erro: a Focus não aceita repetir a mesma ref, então
  // cada tentativa ganha um sufixo.
  const attempt = (order.invoice?.attempt || 0) + 1
  const ref = attempt === 1 ? orderId : `${orderId}-${attempt}`
  try {
    const r = await focus(settings, token, 'POST', `/v2/nfse?ref=${encodeURIComponent(ref)}`, buildNfse(settings, order))
    if (!r.ok && r.status !== 422) return save({ status: 'erro', ref, attempt, error: errorText(r.data) })
    if (r.status === 422 && !/ja_?exist|already/i.test(JSON.stringify(r.data))) return save({ status: 'erro', ref, attempt, error: errorText(r.data) })
    await save({ status: 'processando', ref, attempt, error: null })
    return syncInvoice(orderId)
  } catch (err) {
    return save({ status: 'erro', ref, attempt, error: `Falha ao falar com a Focus NFe: ${err?.message || err}` })
  }
}

/** Consulta a nota na Focus e atualiza o pedido (autorizada → manda e-mail). */
export async function syncInvoice(orderId) {
  const snap = await getDoc(`storeOrders/${orderId}`)
  if (!snap.exists) return null
  const order = snap.data()
  const inv = order.invoice
  if (!inv?.ref || inv.status !== 'processando') return inv || null
  const settings = { ...(await getInvoiceSettings()), environment: inv.environment }
  const token = await getToken()
  if (!token) return inv

  const r = await focus(settings, token, 'GET', `/v2/nfse/${encodeURIComponent(inv.ref)}`)
  const d = r.data || {}
  let next = inv
  if (d.status === 'autorizado') {
    next = {
      ...inv,
      status: 'autorizado',
      numero: d.numero || null,
      codigoVerificacao: d.codigo_verificacao || null,
      pdfUrl: d.url || d.url_danfse || null,
      xmlUrl: d.caminho_xml_nota_fiscal ? `${BASE[settings.environment === 'producao' ? 'producao' : 'homologacao']}${d.caminho_xml_nota_fiscal}` : null,
      error: null,
      authorizedAt: new Date().toISOString(),
    }
    if (order.buyer?.email) {
      const mail = await focus(settings, token, 'POST', `/v2/nfse/${encodeURIComponent(inv.ref)}/email`, { emails: [order.buyer.email] }).catch(() => null)
      next.emailSent = !!mail?.ok
    }
  } else if (d.status === 'erro_autorizacao') {
    next = { ...inv, status: 'erro', error: errorText(d) }
  } else if (d.status === 'cancelado') {
    next = { ...inv, status: 'cancelado' }
  }
  if (next !== inv) await updateDoc(`storeOrders/${orderId}`, { invoice: { ...next, updatedAt: new Date().toISOString() } })
  return next
}

/** Cancela a nota (usado no reembolso). */
export async function cancelInvoice(orderId, reason = 'Cancelamento da compra a pedido do cliente (reembolso).') {
  const snap = await getDoc(`storeOrders/${orderId}`)
  const inv = snap.exists ? snap.data().invoice : null
  if (!inv?.ref || inv.status !== 'autorizado') return null
  const settings = { ...(await getInvoiceSettings()), environment: inv.environment }
  const token = await getToken()
  if (!token) return null
  const r = await focus(settings, token, 'DELETE', `/v2/nfse/${encodeURIComponent(inv.ref)}`, { justificativa: reason })
  const next = r.ok || r.data?.status === 'cancelado' ? { ...inv, status: 'cancelado' } : { ...inv, cancelError: errorText(r.data) }
  await updateDoc(`storeOrders/${orderId}`, { invoice: { ...next, updatedAt: new Date().toISOString() } })
  return next
}
