// Quem pode usar o Copiloto de Vendas (sugestão, transcrição, resumo) — lista
// fixa por e-mail, não por role. Mesma lista em src/config/copilotoAccess.ts
// (frontend/extensão) e firestore.rules (isCopiloto()) — atualize as três
// juntas. Duplicado aqui porque Vercel Functions empacotam api/_lib/** num
// bundle separado do frontend; não dá pra importar src/ daqui.
export const COPILOTO_ALLOWED_EMAILS = ['arrowshotmkt@gmail.com', 'gestorarrowshotmkt@gmail.com']

export function temAcessoAoCopiloto(email) {
  if (!email) return false
  const lower = String(email).trim().toLowerCase()
  return COPILOTO_ALLOWED_EMAILS.some((e) => e.toLowerCase() === lower)
}
