// Aviso de erro nas telas: o navegador manda POST /api/meta/erro quando uma
// tela quebra (CRM, checkout, área de membros). Fica aqui dentro do grupo
// /api/meta só porque o plano Hobby da Vercel já está no limite de funções.
//
// Cada erro diferente vira um doc em errorReports/{impressão digital} com
// quantas vezes aconteceu, a última tela e quem estava usando. O dono do CRM
// recebe notificação (sino + push no celular) na primeira vez e, se o erro
// continuar, no máximo de 6 em 6 horas — sem encher o sino.

import { createHash, randomUUID } from 'node:crypto'
import { getDoc, setDoc, listDocs } from './firebaseAdmin.js'
import { sendPushToUsers } from './webPush.js'

/** Quem recebe os avisos de erro (e-mail do login no CRM). */
const RECIPIENT_EMAILS = ['gestorarrowshot@gmail.com']
const RENOTIFY_MS = 6 * 60 * 60 * 1000

const cut = (v, n) => String(v ?? '').slice(0, n)

// Barreira simples contra abuso: por instância, no máximo 60 avisos por minuto.
let windowStart = 0
let windowCount = 0
function overLimit() {
  const now = Date.now()
  if (now - windowStart > 60_000) {
    windowStart = now
    windowCount = 0
  }
  windowCount++
  return windowCount > 60
}

/** Tira números e ids do caminho pra juntar o mesmo erro em telas parecidas. */
function routePattern(path) {
  return cut(path, 200).replace(/\/[A-Za-z0-9_-]{16,}/g, '/:id').replace(/\/\d+/g, '/:n')
}

export async function errorReportHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })
  if (overLimit()) return res.status(429).json({ error: 'Muitos avisos' })

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = {}
    }
  }
  body = body || {}
  const message = cut(body.message, 300).trim()
  if (!message) return res.status(400).json({ error: 'Sem mensagem' })
  // Requisição cancelada no navegador (saiu da tela, conexão caiu): não é erro.
  // Filtra aqui também porque abas abertas com a versão antiga ainda mandam.
  if (/signal is aborted|operation was aborted|user aborted|AbortError/i.test(message)) {
    return res.status(200).json({ ok: true, ignored: true })
  }

  const path = cut(body.path, 200)
  const kind = cut(body.kind, 30) || 'erro'
  const who = cut(body.userName, 80) || 'Visitante (sem login)'
  const fingerprint = createHash('sha256').update(`${message}|${routePattern(path)}`).digest('hex').slice(0, 32)
  const docPath = `errorReports/${fingerprint}`
  const now = new Date()

  try {
    const snap = await getDoc(docPath)
    const prev = snap.exists ? snap.data() : null
    const lastNotified = prev?.lastNotifiedAt ? new Date(prev.lastNotifiedAt).getTime() : 0
    const shouldNotify = !prev || Date.now() - lastNotified > RENOTIFY_MS
    const count = (prev?.count || 0) + 1

    await setDoc(docPath, {
      message,
      kind,
      stack: cut(body.stack, 4000),
      path,
      userName: who,
      userAgent: cut(body.userAgent, 300),
      release: cut(body.release, 40),
      count,
      firstAt: prev?.firstAt ? new Date(prev.firstAt) : now,
      lastAt: now,
      lastNotifiedAt: shouldNotify ? now : prev?.lastNotifiedAt ? new Date(prev.lastNotifiedAt) : now,
    })

    if (shouldNotify) {
      const users = await listDocs('users')
      const recipients = users.filter((u) => u.active !== false && RECIPIENT_EMAILS.includes(String(u.email || '').toLowerCase()))
      const vezes = count > 1 ? ` (${count}ª vez)` : ''
      const text = `Erro na tela ${path || '/'}${vezes} — ${who}: ${message}`
      await Promise.all(
        recipients.map((u) =>
          setDoc(`notifications/${randomUUID()}`, {
            userId: u.id,
            type: 'system_error',
            message: cut(text, 500),
            actorName: 'Sistema',
            read: false,
            createdAt: now,
          })
        )
      )
      await sendPushToUsers(
        recipients.map((u) => u.id),
        { title: 'Erro no CRM', body: cut(text, 180), url: '/notificacoes', tag: `erro-${fingerprint.slice(0, 8)}` }
      ).catch((err) => console.warn('[erro] push falhou:', err?.message))
    }
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[erro] falha ao registrar aviso de erro:', err)
    return res.status(500).json({ error: 'Falha ao registrar' })
  }
}
