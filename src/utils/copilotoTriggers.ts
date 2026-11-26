/** Detecção leve (palavra-chave, sem IA) de objeção/dúvida/sinal de compra
 *  na fala do CLIENTE — usada só pra decidir SE chama a IA, não pra gerar a
 *  sugestão em si (ver hooks/useCopilotoSugestoes.ts). Prefere pecar por
 *  detectar demais: falso positivo custa uma chamada de IA extra (e há
 *  cooldown), falso negativo custa uma sugestão perdida. Os padrões são
 *  soltos de propósito — o Whisper raramente escreve a frase exata ("já
 *  tentei fazer anúncio", "anunciei no Insta", "tá caro"...). */
const TRIGGER_PATTERNS: RegExp[] = [
  // preço / dinheiro
  /\bcar[oa]\b/i,
  /\bpre[çc]o/i,
  /\bvalor/i,
  /\bquanto\b/i,
  /desconto/i,
  /\bdinheiro\b/i,
  /\bverba\b/i,
  /\binvestiment/i,
  /\bmensalidade\b/i,
  /\bor[çc]amento\b/i,
  // experiência anterior com marketing
  /an[úu]nci/i,
  /\banunci(ei|ar|o|amos)\b/i,
  /tr[áa]fego/i,
  /instagram|\binsta\b/i,
  /facebook|\bface\b/i,
  /\bgoogle\b/i,
  /impulsion/i,
  /ag[êe]ncia/i,
  /j[áa] (tentei|testei|fiz|usei|paguei|contratei)/i,
  /n[ãa]o (deu|funcionou|trouxe|veio) (certo|nada|resultado|cliente)/i,
  // indecisão / decisor
  /vou pensar/i,
  /pensar melhor/i,
  /n[ãa]o sei se/i,
  /(preciso|vou|tenho que) (falar|conversar|ver) com/i,
  /\bs[óo]cio/i,
  /\bmeu marido\b|\bminha esposa\b|\bminha mulher\b/i,
  /n[ãa]o tenho tempo/i,
  /agora n[ãa]o/i,
  /mais pra frente/i,
  // dúvidas sobre o serviço
  /contrato/i,
  /fidelidade/i,
  /garant/i,
  /resultado/i,
  /quanto tempo/i,
  /funciona/i,
  /minha cidade|minha regi[ãa]o/i,
  /\bgolpe\b|\benganad|\bconfian[çc]a\b|\bmedo\b/i,
  /como (funciona|[ée] que funciona|voc[êe]s trabalham)/i,
]

export function shouldTriggerSuggestion(texto: string): boolean {
  return TRIGGER_PATTERNS.some((re) => re.test(texto))
}
