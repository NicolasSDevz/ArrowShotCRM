/** Detecção leve (palavra-chave, sem IA) de objeção/dúvida/sinal de compra
 *  na fala do CLIENTE — usada só pra decidir SE chama a IA, não pra gerar a
 *  sugestão em si (ver hooks/useCopilotoSugestoes.ts). Mantém a lista curta
 *  de propósito: falso positivo custa uma chamada de IA extra, falso
 *  negativo custa uma sugestão perdida — prefere pecar por detectar demais. */
const TRIGGER_PATTERNS: RegExp[] = [
  /\bcar[oa]\b/i,
  /\bpre[çc]o\b/i,
  /\bvalor\b/i,
  /quanto custa/i,
  /desconto/i,
  /vou pensar/i,
  /j[áa] tenho (uma )?ag[êe]ncia/i,
  /j[áa] tentei (an[úu]ncio|tr[áa]fego|google|facebook|instagram)/i,
  /n[ãa]o tenho tempo/i,
  /funciona na minha cidade/i,
  /quanto tempo (pra|para) (ter resultado|resultado|come[çc]ar)/i,
  /tem contrato/i,
  /fidelidade/i,
  /preciso falar com/i,
  /vou (falar|conversar) com (minha|meu|a|o)/i,
  /n[ãa]o tenho dinheiro/i,
  /medo de (golpe|cair em|ser enganado)/i,
  /garante(m)? resultado/i,
  /quanto (vai custar|fica)/i,
]

export function shouldTriggerSuggestion(texto: string): boolean {
  return TRIGGER_PATTERNS.some((re) => re.test(texto))
}
