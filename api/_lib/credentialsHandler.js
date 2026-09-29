// Rotas dos acessos dos clientes — servidas por /api/meta/token?scope=credentials
// (o projeto está no limite de funções do plano Hobby da Vercel, então essa
// lógica mora dentro de uma função que já existe).
//
// Equipe (login obrigatório):
//   GET    ?scope=credentials&client_id=X                 → { entries, request }
//   GET    ?scope=credentials&client_id=X&reveal=KEY      → { password }  (fica registrado)
//   POST   ?scope=credentials { clientId, key, label?, login?, password?, note? }
//   DELETE ?scope=credentials&client_id=X&key=KEY
//   POST   ?scope=credentials&action=link { clientId, clientName }   → { token }
//   DELETE ?scope=credentials&action=link&client_id=X
// Cliente (sem login, pelo link):
//   GET    ?scope=credentials&link=TOKEN                  → { clientName }
//   POST   ?scope=credentials&link=TOKEN { entries }      → { saved }

import { requireInternalUser, AuthError } from './auth.js'
import {
  listCredentials,
  saveCredential,
  deleteCredential,
  revealPassword,
  createRequestLink,
  getRequestStatus,
  disableRequestLink,
  getPublicRequest,
  submitFromClient,
} from './credentialsStore.js'

function fail(res, err) {
  if (err instanceof AuthError) return res.status(err.status).json({ error: err.message })
  const status = err?.status || 500
  if (status >= 500) console.error('[credentials] erro:', err)
  const msg = /META_TOKEN_ENCRYPTION_KEY/.test(err?.message || '')
    ? 'A chave de criptografia (META_TOKEN_ENCRYPTION_KEY) não está configurada no servidor.'
    : err?.message || 'Erro interno'
  return res.status(status).json({ error: msg })
}

export async function credentialsHandler(req, res) {
  // Nada disso pode ficar em cache (senha, status do link).
  res.setHeader('Cache-Control', 'no-store')
  try {
    // ---------- cliente, pelo link ----------
    const link = req.query.link
    if (link) {
      if (req.method === 'GET') {
        const r = await getPublicRequest(String(link))
        if (!r) return res.status(404).json({ error: 'Link desativado ou inválido' })
        return res.status(200).json({ clientName: r.clientName })
      }
      if (req.method === 'POST') {
        const saved = await submitFromClient(String(link), req.body?.entries)
        return res.status(200).json({ saved })
      }
      return res.status(405).json({ error: 'Método não permitido' })
    }

    // ---------- equipe ----------
    const user = await requireInternalUser(req)
    const action = req.query.action

    if (action === 'link') {
      if (req.method === 'POST') {
        const { clientId, clientName } = req.body || {}
        if (!clientId || !clientName) return res.status(400).json({ error: 'clientId e clientName são obrigatórios' })
        const token = await createRequestLink(String(clientId), String(clientName).slice(0, 120), user)
        return res.status(200).json({ token })
      }
      if (req.method === 'DELETE') {
        if (!req.query.client_id) return res.status(400).json({ error: 'client_id obrigatório' })
        await disableRequestLink(String(req.query.client_id))
        return res.status(200).json({ ok: true })
      }
      return res.status(405).json({ error: 'Método não permitido' })
    }

    if (req.method === 'GET') {
      const clientId = req.query.client_id
      if (!clientId) return res.status(400).json({ error: 'client_id obrigatório' })
      if (req.query.reveal) {
        const password = await revealPassword(String(clientId), String(req.query.reveal), user)
        return res.status(200).json({ password })
      }
      const [entries, request] = await Promise.all([listCredentials(String(clientId)), getRequestStatus(String(clientId))])
      return res.status(200).json({ entries, request })
    }

    if (req.method === 'POST') {
      const { clientId, key, label, login, password, note } = req.body || {}
      if (!clientId || !key) return res.status(400).json({ error: 'clientId e key são obrigatórios' })
      await saveCredential(String(clientId), String(key), { label, login, password, note }, user.name)
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const { client_id: clientId, key } = req.query
      if (!clientId || !key) return res.status(400).json({ error: 'client_id e key são obrigatórios' })
      await deleteCredential(String(clientId), String(key))
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Método não permitido' })
  } catch (err) {
    return fail(res, err)
  }
}
