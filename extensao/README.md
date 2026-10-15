# Copiloto de Vendas — extensão do Chrome

Painel lateral do Chrome que roda dentro do Google Meet com as sugestões do
Copiloto de Vendas, sem precisar trocar de aba. Toda a inteligência (IA,
Base de Vendas, salvamento no lead) continua no CRM — essa extensão é só a
interface e a captura de áudio.

A página `/copiloto` do CRM continua funcionando normalmente, como
alternativa caso a extensão dê algum problema.

## Como instalar (modo desenvolvedor)

1. Garanta que as dependências do CRM já estão instaladas (a extensão
   reaproveita o `node_modules` e o código do projeto raiz — não tem
   instalação própria):
   ```
   npm install
   ```
   (na raiz do repositório, `ArrowShotCRM/`, se ainda não tiver feito)

2. Builde a extensão (também na raiz do repositório):
   ```
   npm run build:extensao
   ```
   Isso gera a pasta `extensao/dist/` com tudo que o Chrome precisa.

3. No Chrome, abra `chrome://extensions`.

4. Ligue o **"Modo do desenvolvedor"** (canto superior direito).

5. Clique **"Carregar sem compactação"** e selecione a pasta
   `ArrowShotCRM/extensao/dist` (a pasta `dist`, não a `extensao`).

6. O ícone "Copiloto de Vendas" aparece na barra de extensões. Abra uma
   chamada no **meet.google.com** — o painel lateral da extensão liga
   automaticamente só nessa aba (em qualquer outro site ele fica desligado).
   Clique no ícone da extensão (ou no ícone de painel lateral do Chrome, ao
   lado da barra de endereço) para abrir o painel.

7. Faça login com a mesma conta do CRM (e-mail e senha) — só continua quem
   tem acesso ao Copiloto (Bruno e Ciane); os demais veem "Sem acesso".

8. Na 1ª vez que clicar "Iniciar", o Chrome vai pedir permissão de
   microfone — depois disso não pede de novo.

### Repetir depois de uma mudança no código

Sempre que o código da extensão (ou de algo que ela reaproveita do CRM, em
`src/`) mudar, repita o passo 2 (`npm run build:extensao`) e depois, em
`chrome://extensions`, clique no botão de recarregar (⟳) no card da
extensão — não precisa remover e carregar de novo.

## Como funciona (resumo técnico)

- **Painel lateral** (`sidepanel.html`/`sidepanel.tsx`): só interface —
  mostra status, sugestões, transcrição e os botões. Nunca captura áudio
  nem chama a IA diretamente.
- **Offscreen document** (`offscreen.html`/`offscreen.ts`): roda escondido,
  sem janela — é onde o microfone do Bruno e o áudio da aba do Meet
  (`chrome.tabCapture`) são capturados, processados pelo VAD e enviados pro
  Groq, e onde as sugestões/resumo são pedidos à IA do CRM. Fica aqui (e não
  no painel) justamente pra não sofrer o throttling de timers que o Chrome
  aplica a abas/paineis em segundo plano.
- **Background** (`background.ts`, service worker): só liga/desliga o
  painel lateral por aba (só em meet.google.com) e garante que o offscreen
  document existe quando precisa.
- Login, Firestore (`leads/{id}/chamadas/{id}`) e a Base de Vendas são os
  mesmos do CRM — a extensão importa o código de `src/` direto (ver
  `vite.config.ts`: `envDir` apontado pro `.env.local` da raiz, pra usar a
  mesma config do Firebase).
- As chamadas de IA (`/api/ai/sugestao`, `/api/ai/resumo`, `/api/ai/transcrever`)
  vão pro CRM publicado (`extensao/src/lib/aiApi.ts` — ajuste `CRM_BASE_URL`
  se o domínio mudar), autenticadas com o token do Firebase do usuário
  logado. O backend (`api/ai/index.js`) libera CORS só para a origem fixa
  dessa extensão (`chrome-extension://cpajbjjkaphacinbmoeininpgocjgmoj` —
  fixa porque o `manifest.json` tem uma `"key"` pinada; se gerar uma nova
  key, o ID muda e o CORS do backend precisa ser atualizado também).
- O VAD (`@ricky0123/vad-web`) e o runtime do onnxruntime-web normalmente
  carregam os arquivos de modelo/wasm de uma CDN — mas o CSP padrão de
  Manifest V3 bloqueia isso (só libera script de `'self'`). Por isso o
  `vite.config.ts` da extensão copia esses arquivos do `node_modules` pra
  dentro do próprio pacote (`dist/vad-assets/`, `dist/ort-wasm/`) — só
  acontece no build da extensão, a página normal do CRM continua usando a
  CDN como sempre.

## Vínculo com o lead

Ao abrir o painel numa chamada, ele lê o código da reunião na URL do Meet e
procura no Firestore uma reunião de venda (`meetings`, `type: 'sales'`)
cujo link do Meet tenha o mesmo código, pra achar o lead automaticamente. Se
não achar (reunião não veio do CRM, ou o link não bate), mostra uma busca
rápida por nome/empresa pra escolher o lead na mão.

## Limitações conhecidas / pontos pra testar

- **Testado só por build e checagem de tipos** — não tem como testar
  captura de microfone/aba real nesse ambiente. No teste real, observe:
  - Se o áudio da aba do Meet continua tocando normalmente (o
    `chrome.tabCapture` silencia a aba por padrão se não for roteado de
    volta pros alto-falantes — já tratado no `offscreen.ts`, mas confirme
    ouvindo o cliente numa chamada de verdade).
  - Se o VAD inicializa sem erro no console do offscreen document (abra
    `chrome://extensions` → card da extensão → "Inspecionar views:
    offscreen.html" pra ver os logs dele).
  - Se as sugestões automáticas aparecem (mesmas regras de
    `copilotoTriggers.ts` da página normal).
- **Uma chamada por vez.** Se o Bruno tiver duas abas do Meet abertas, o
  painel segue a aba ativa no momento em que foi aberto — não foi pensado
  pra acompanhar duas chamadas simultâneas.
- A extensão pede a permissão **"tabs"** pra conseguir ler a URL de
  qualquer aba e decidir se liga o painel (só liga em meet.google.com) —
  isso aparece como aviso de permissão mais chamativo na instalação; é
  esperado.
