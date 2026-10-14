export interface SubitemConfig {
  key: string
  label: string
}

export interface MesJornadaConfig {
  mes: string
  tema: string
  descricao: string
  maquina: 1 | 2 | 3
  subitens?: SubitemConfig[]
}

export interface MaquinaConfig {
  id: 1 | 2 | 3
  nome: string
  subtitulo: string
}

export const MAQUINAS_JORNADA: MaquinaConfig[] = [
  { id: 1, nome: 'Máquina 1 — Atendimento', subtitulo: 'Transformar contatos em oportunidades' },
  { id: 2, nome: 'Máquina 2 — Vendas', subtitulo: 'Transformar oportunidades em clientes' },
  { id: 3, nome: 'Máquina 3 — Escala e Autonomia', subtitulo: 'Crescimento estruturado e maturidade' },
]

export const MESES_JORNADA: MesJornadaConfig[] = [
  {
    mes: '01',
    maquina: 1,
    tema: 'Onboarding',
    descricao: 'Alinhamento técnico, definição de KPIs e configuração inicial da jornada.',
    subitens: [
      { key: 'onboarding', label: 'Onboarding — conhecimento mútuo, canais de comunicação, expectativas' },
      { key: 'briefing', label: 'Briefing — modelo de negócio, metas comerciais, diferenciais' },
      { key: 'estrategia', label: 'Estratégia — análise competitiva e plano tático das primeiras campanhas' },
    ],
  },
  { mes: '02', maquina: 1, tema: 'WhatsApp', descricao: 'Otimização do fluxo de resposta e condução estratégica de leads.' },
  { mes: '03', maquina: 1, tema: 'Qualificação', descricao: 'Filtro de leads para focar nas oportunidades de alto valor.' },
  { mes: '04', maquina: 1, tema: 'Visita Técnica', descricao: 'Estruturação do agendamento para garantir o primeiro contato presencial.' },
  { mes: '05', maquina: 2, tema: 'Posicionamento', descricao: 'Autoridade durante a visita técnica.' },
  { mes: '06', maquina: 2, tema: 'Orçamento', descricao: 'Apresentação de alto valor percebido.' },
  { mes: '07', maquina: 2, tema: 'Gatilhos', descricao: 'Psicologia aplicada à decisão de compra.' },
  { mes: '08', maquina: 2, tema: 'Objeções', descricao: 'Segurança no tratamento de dúvidas.' },
  { mes: '09', maquina: 2, tema: 'Follow-up', descricao: 'Recuperação de propostas pendentes.' },
  { mes: '10', maquina: 3, tema: 'Delegação', descricao: 'Processos para reduzir a dependência da operação diária.' },
  { mes: '11', maquina: 3, tema: 'Expansão', descricao: 'Novos serviços e otimização do portfólio de receita.' },
  { mes: '12', maquina: 3, tema: 'Novos Canais', descricao: 'Prospecção direta e parcerias estratégicas locais.' },
]
