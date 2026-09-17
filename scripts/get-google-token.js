/**
 * Gera um Refresh Token da Google Ads API rodando o fluxo OAuth localmente
 * (alternativa ao OAuth Playground, que algumas contas Google bloqueiam por
 * política de chave de acesso).
 *
 * Fluxo manual (cole o código) em vez de servidor HTTP local: útil quando a
 * autorização é feita pelo celular — localhost:3001 do computador não é
 * acessível pelo navegador do celular, então o redirect final SEMPRE falha
 * ao carregar. Isso é esperado: a página não precisa carregar, só precisa
 * chegar no endereço — o código de autorização já está na URL da barra de
 * endereço do navegador (ou na tela de erro "não foi possível acessar o
 * site"). Copie essa URL (ou só o valor de "code=") e cole aqui no terminal.
 *
 * Configuração (uma vez só):
 *   1. Google Cloud Console > APIs & Services > Credentials > abra o OAuth
 *      Client ID (Web application) usado pelo Google Ads e adicione
 *      http://localhost:3001/callback em "Authorized redirect URIs" — SEM
 *      remover as URIs que já existem lá.
 *   2. Crie um arquivo .env.local na raiz do projeto (já é ignorado pelo
 *      git — ver .gitignore) com:
 *        GOOGLE_ADS_CLIENT_ID=889044994032-bofuas9i6s93lafejcj807rr4st5qmb9.apps.googleusercontent.com
 *        GOOGLE_ADS_CLIENT_SECRET=<o client secret real, do Cloud Console>
 *      (ver .env.example — essas são as mesmas variáveis que as Vercel
 *      Functions de Google Ads vão usar em produção).
 *
 * Uso:
 *   node --env-file=.env.local scripts/get-google-token.js
 *
 * Abra a URL impressa no terminal (pode ser pelo celular), faça login com a
 * conta Google que administra o Google Ads (gestorarrowshotmkt@gmail.com),
 * aceite o consentimento. O navegador vai tentar abrir
 * http://localhost:3001/callback?code=... e falhar (esperado) — copie essa
 * URL da barra de endereço (ou só o código) e cole no terminal quando pedido.
 * O Refresh Token aparece em seguida — copie e salve como
 * GOOGLE_ADS_REFRESH_TOKEN nas Environment Variables do Vercel.
 *
 * O client secret NUNCA fica neste arquivo nem é commitado — só existe no
 * seu .env.local local.
 */

import { google } from 'googleapis'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const CLIENT_ID =
  process.env.GOOGLE_ADS_CLIENT_ID || '889044994032-bofuas9i6s93lafejcj807rr4st5qmb9.apps.googleusercontent.com'
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET
// Precisa bater com uma URI já cadastrada no Cloud Console — não sobe
// servidor nenhum nessa porta, é só o valor que o Google exige ecoar de volta.
const REDIRECT_URI = 'http://localhost:3001/callback'

if (!CLIENT_SECRET) {
  console.error('Faltou GOOGLE_ADS_CLIENT_SECRET.')
  console.error('Crie um .env.local com GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET e rode:')
  console.error('  node --env-file=.env.local scripts/get-google-token.js')
  process.exit(1)
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/adwords'],
  prompt: 'consent', // força o Google a sempre reemitir um refresh_token
})

console.log('Acesse esta URL no navegador (pode ser pelo celular; faça login com a conta que administra o Google Ads):')
console.log(authUrl)
console.log('')
console.log('Depois de aceitar, o navegador tenta abrir http://localhost:3001/callback?code=...')
console.log('e vai FALHAR ao carregar — isso é esperado. Copie essa URL da barra de endereço')
console.log('(ou só o valor depois de "code=") e cole abaixo.')
console.log('')

/** Aceita tanto a URL completa do redirect quanto só o código cru. */
function extractCode(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return { code: null, error: null }

  // Formato "code=XXXX&outros=parametros" (com ou sem "?" na frente), sem o
  // resto da URL — vira uma query string de verdade antes de parsear.
  const asQuery = /^[?&]?code=/.test(trimmed)
  const candidate = asQuery ? `http://localhost/?${trimmed.replace(/^[?&]/, '')}` : trimmed

  try {
    const parsed = new URL(candidate)
    return { code: parsed.searchParams.get('code'), error: parsed.searchParams.get('error') }
  } catch {
    // Não é uma URL válida — assume que já é o código cru.
    return { code: trimmed, error: null }
  }
}

const rl = createInterface({ input: stdin, output: stdout })
const answer = await rl.question('Cole o código de autorização aqui: ')
rl.close()

const { code, error } = extractCode(answer)

if (error) {
  console.error('Google retornou um erro:', error)
  process.exit(1)
}
if (!code) {
  console.error('Não encontrei um código de autorização no que foi colado.')
  process.exit(1)
}

try {
  const { tokens } = await oauth2Client.getToken(code)
  console.log('')
  console.log('REFRESH TOKEN:', tokens.refresh_token)
  console.log('ACCESS TOKEN:', tokens.access_token)
  console.log('')
  console.log('Copie o REFRESH TOKEN acima e salve como GOOGLE_ADS_REFRESH_TOKEN')
  console.log('nas Environment Variables do Vercel (Settings > Environment Variables).')
} catch (err) {
  console.error('Falha ao trocar o código pelo token:', err.message)
  process.exit(1)
}
