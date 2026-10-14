import type { BaseVendas } from '../types/baseVendas'

/** Semente da Base de Vendas — texto EXTRAÍDO VERBATIM da seção "Vendas da
 *  Arrow Shot" que vivia hardcoded no system prompt do Archer
 *  (api/ai/index.js, BASE_SYSTEM_PROMPT), reorganizado nos campos da tela.
 *  Usada só quando `config/baseVendas` ainda não existe no Firestore — a
 *  tela "Base de Vendas" grava isso lá na primeira visita, e desse ponto em
 *  diante o Firestore é a única fonte (ver src/types/baseVendas.ts). */
export const DEFAULT_BASE_VENDAS: Omit<BaseVendas, 'updatedAt' | 'updatedBy'> = {
  oQueVendemos:
    'Assessoria de marketing para empresas de limpeza pós-obra, polimento de pisos, restauração, telhados e impermeabilização. Google Ads (principal) + Meta Ads (apoio) + página de conversão + acompanhamento semanal. Ticket padrão R$ 1.297/mês; R$ 3.000/mês para empresas maiores. Preço só é falado na reunião com o especialista, nunca pelo SDR.\n\nFunil: origem (formulário de anúncio Meta/Google, base antiga, feira, indicação, orgânico) → boas-vindas e SDR no WhatsApp → qualificação → agendamento → reunião de diagnóstico com o Bruno (~35 min: diagnóstico, apresentação, decisão) → proposta → follow-up → fechamento → pagamento → onboarding.',

  metas:
    'MRR R$ 35.000 até 31/12; 12 contratos novos (4/mês); churn ≤ 1 cliente/mês; 60 reuniões de diagnóstico (20/mês); 90 leads qualificados (30/mês); conversão reunião → fechamento ≥ 25% (histórico ~16%); CPL Meta ≤ R$ 8. Outubro: 4 a 6 contratos, ~30 reuniões, ~18 propostas. HIGIEXPO 20 a 22/10/2026 (stand A315): 10+ reuniões agendadas, todo contato no CRM no mesmo dia, mensagem em até 12h, reuniões pós-feira de 27 a 31/10.',

  icpAntiIcp:
    'ICP: 2+ anos de empresa; 3+ obras/mês; ticket acima de R$ 2.000 por obra; 1+ funcionário com carteira; decisor presente; sem gestor de tráfego (ou insatisfeito / contrato vencendo); capta por indicação e quer previsibilidade. Cidades médias com pouca concorrência digital são prioridade.\n\nAnti-ICP (não agendar): diarista, doméstica, industrial, flats de temporada; menos de 6 meses ou sem CNPJ; "quando fechar um serviço te falo" sem data; contratou gestor há menos de 30 dias; caixa irregular; 100% residencial/condomínio querendo "migrar pra pós-obra".',

  qualificacao:
    'Qualificação obrigatória antes de agendar: (1) nicho certo; (2) caixa, perguntado indiretamente e uma pergunta por vez: 3+ obras/mês, ticket > R$ 2.000, funcionário com carteira; (3) decisor e se existe segundo decisor (sócio, cônjuge, contador). Com segundo decisor: call a três com data e hora fixas; nunca aceitar "vou falar com ela e te retorno". Caixa travado COM data concreta é qualificável (nutrir e lembrar na data); sem data, despriorizar.',

  sinaisCompra:
    'Sinais de compra: perguntou preço cedo, indicou alguém do ramo, citou equipe/equipamento, responde rápido e com detalhe, perguntou prazo de início.\n\nSinais ruins: nunca pergunta preço, "vou falar com o contador", "estou começando", formulário só com nome e número, "me manda por e-mail".',

  bant: 'Nota 0 a 3 em Budget, Authority, Need, Timing. 9 a 12 quente (agendar reunião), 6 a 8 morno (nutrir e recontatar logo), 0 a 5 frio. Budget ou Authority zerado desqualifica.',

  sdrWhatsapp:
    'Abertura em duas mensagens (apresentação curta, depois "nome da empresa e onde atua"); uma pergunta por mensagem, nesta ordem: empresa e cidade → serviço → tempo de mercado → como capta hoje → maior desafio (repetir a dor com as palavras do lead) → caixa → decisor → convite. Convite sempre com duas opções fechadas ("amanhã de manhã ou à tarde?"), reunião online de 20 min, sem custo, com plano para a cidade do lead. Lead quente (formulário < 7 dias) recebe contato no mesmo dia. Ligar só depois de contexto por texto; respeitar o canal (não mandar áudio pra quem pediu texto). Qualificar e não convidar é a falha mais grave do SDR.',

  noShowFollowUp:
    'No-show: confirmação, lembrete 30 min antes, reagendar em até 2h.\n\nFollow-up pós-reunião (principal vazamento): 1h, 24h, 48h, 72h, sempre citando algo específico da conversa. Lead que some: dias 1, 3, 7 e 10. Pós-obra: 5 contatos em 14 dias. Reativação com dor única ("falta de clientes novos"). Firmeza profissional funciona; mensagem confrontadora piora. Fechamentos rápidos acontecem 1 a 3 dias depois do diagnóstico.',

  objecoes: [
    {
      id: 'obj-1',
      objecao: 'Quero ver resultado primeiro',
      resposta:
        'A mais comum (falta de confiança): primeiros leads em ~1 semana, antes do boleto; perguntar "quantos contratos você precisa fechar pra se pagar?". Sem teste grátis, sem desconto.',
    },
    {
      id: 'obj-2',
      objecao: 'Preciso falar com sócia/esposa/sócio',
      resposta: 'Maior causa de perda: call a três de 15 min com data e hora fixas.',
    },
    {
      id: 'obj-3',
      objecao: 'Já tentei anúncio e não funcionou',
      resposta: 'Diagnosticar o que faltou, diferenciar pela especialização no nicho, case do mesmo nicho.',
    },
    {
      id: 'obj-4',
      objecao: 'Medo de golpe',
      resposta: 'Mandar na hora 3 contatos reais de clientes de região parecida (não áudio emocional, print ou depoimento escrito).',
    },
    {
      id: 'obj-5',
      objecao: 'Não tenho dinheiro agora',
      resposta: 'Tem contrato chegando? Com data, reagendar; sem data, anotar e retomar depois. Sem desconto.',
    },
  ],

  provaSocial:
    'Quer número → case WA (de R$ 7 mil para R$ 80 mil/mês, o único com número autorizado); emocional → áudio da Ana, Marcia (MDA Serviços, São Luís/MA); desconfiado → 3 contatos reais pra ligar; cidade pequena → Rafael (Manaus), Marcia (São Luís). Outros verificados: Daniel B. (MDL, Goiânia), Jô (Prime Shine), Celso e Lucas (São Carlos/SP), Realize Clean, Grupo WA Facilities.\n\nNunca citar o caso "Walter".',

  pagamento:
    'Fechou, falta pagar: +1h link de pagamento; +24h sem pagar → ligar (não WhatsApp); +48h mensagem com prazo, vaga sendo liberada; +72h liberar a vaga formalmente. (Em julho/2026, 4 de 8 fechamentos não viraram pagamento.)',

  retencao: 'Checkpoints de 30 e 60 dias, ligar pra cliente com menos de 90 dias, registrar SEMPRE o motivo de churn.',

  errosComuns:
    'Agendar sem confirmar caixa; não convidar depois de qualificar; duas perguntas na mesma mensagem; follow-up genérico copiado; cadência lenta; prova emocional pra desconfiado; aceitar "vou falar com ela e te retorno"; reunião com lead fora do perfil; lead perdido sem motivo registrado.',

  oQueNuncaPrometer:
    'Nunca prometer resultado garantido, número exato de clientes/vendas ou prazo fixo de retorno sobre investimento. Sem teste grátis, sem desconto fora do que está combinado aqui. Nunca inventar case, depoimento, número ou urgência/escassez falsa. Nunca citar o caso "Walter".',
}
