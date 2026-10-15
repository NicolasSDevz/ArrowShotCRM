/** Quem pode usar o Copiloto de Vendas (página, extensão e chamadas salvas
 *  nos leads) e editar a Base de Vendas — lista fixa por e-mail de login,
 *  NÃO por role: um admin/manager novo não ganha acesso ao Copiloto
 *  sozinho, é preciso adicionar o e-mail aqui.
 *
 *  Pedido explícito do usuário, 2026-10-14. Antes disso o controle era
 *  "admin ou manager" — na época só Bruno e Ciane tinham essas roles, então
 *  a troca pra lista fixa não tirou acesso de ninguém.
 *
 *  Mesma lista em:
 *  - api/_lib/copilotoAccess.js (backend — Vercel Function, bundle
 *    separado, não dá pra importar este arquivo dali)
 *  - firestore.rules (função isCopiloto())
 *  A extensão do Chrome (extensao/) importa ESTE arquivo direto, igual ao
 *  resto do código que ela reaproveita. Atualize as três listas juntas. */
export const COPILOTO_ALLOWED_EMAILS = ['arrowshotmkt@gmail.com', 'gestorarrowshotmkt@gmail.com']

export function temAcessoAoCopiloto(email: string | null | undefined): boolean {
  if (!email) return false
  const lower = email.trim().toLowerCase()
  return COPILOTO_ALLOWED_EMAILS.some((e) => e.toLowerCase() === lower)
}
