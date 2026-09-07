// Vercel Function — GET /api/meta/test
//
// Endpoint de diagnóstico: confirma que as Vercel Functions estão no ar e
// que as variáveis necessárias foram configuradas (sem nunca expor os
// valores em si).

export default function handler(req, res) {
  res.json({
    status: 'ok',
    message: 'Vercel Functions funcionando',
    env_configured: !!process.env.META_ACCESS_TOKEN,
    // Necessárias para tokens por cliente (POST /api/meta/token) — ver
    // api/_lib/firebaseAdmin.js e api/_lib/tokenCrypto.js.
    per_client_tokens_configured: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY && !!process.env.META_TOKEN_ENCRYPTION_KEY,
  })
}
