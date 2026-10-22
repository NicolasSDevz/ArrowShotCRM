import { useEffect, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { updateClient } from '../../services/clientService'
import { markBriefingChecklistDone } from '../../services/taskService'
import { notifyBriefingFilled } from '../../services/clientWorkflowTemplates'
import { syncClientBirthdays } from '../../services/birthdayService'
import { prefillPlanningFromBriefing } from '../../utils/briefingToPlanning'
import { dateInputToTimestamp, timestampToDateInput } from '../../utils/dateInput'
import { maskPhone, maskCurrencyInput, parseCurrencyToNumber } from '../../utils/masks'
import {
  EMPTY_PAID_TRAFFIC_BRIEFING,
  CREDIT_CARD_FOR_ADS_LABEL,
  PUBLICO_ATENDIDO_LABEL,
  BRIEFING_CONTACT_ROLES,
  type Client,
  type PaidTrafficBriefing,
  type BriefingContact,
  type BriefingContactRole,
  type CreditCardForAds,
  type PublicoAtendido,
} from '../../types'
import { BriefingProgress, Checkbox, OldAnswers, SaveBar, SectionTitle, SubTitle, useUnsavedWarning } from './briefingUi'

/** Reconstrói o texto mascarado (R$ 0,00) a partir do número guardado. */
function moneyToMasked(v?: number): string {
  if (v == null) return ''
  return maskCurrencyInput(String(Math.round(v * 100)))
}

const filled = (v: unknown) => (typeof v === 'string' ? v.trim() !== '' : v != null)
const normalize = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// ---------------------------------------------------------------- pessoas

/** Uma pessoa do cliente com tudo o que ela faz. No banco a mesma pessoa
 *  fica em cada lista de papel (socios, financeiro...); aqui aparece uma vez. */
interface Person extends BriefingContact {
  roles: BriefingContactRole[]
}

function newPerson(roles: BriefingContactRole[] = []): Person {
  return { id: crypto.randomUUID(), name: '', email: '', whatsapp: '', birthday: null, roles }
}

/** Junta as 6 listas de papel numa lista de pessoas (mesmo id ou mesmo nome
 *  = mesma pessoa). */
function toPeople(b: PaidTrafficBriefing): Person[] {
  const people: Person[] = []
  for (const { key } of BRIEFING_CONTACT_ROLES) {
    for (const c of b[key] ?? []) {
      if (!c?.name?.trim()) continue
      const same = people.find((p) => p.id === c.id || normalize(p.name) === normalize(c.name))
      if (same) {
        if (!same.roles.includes(key)) same.roles.push(key)
        same.email ||= c.email
        same.whatsapp ||= c.whatsapp
        same.birthday ||= c.birthday ?? null
      } else {
        people.push({ id: c.id || crypto.randomUUID(), name: c.name, email: c.email ?? '', whatsapp: c.whatsapp ?? '', birthday: c.birthday ?? null, roles: [key] })
      }
    }
  }
  return people.length ? people : [newPerson(['socios'])]
}

function fromPeople(people: Person[]): Record<BriefingContactRole, BriefingContact[]> {
  const out = {} as Record<BriefingContactRole, BriefingContact[]>
  for (const { key } of BRIEFING_CONTACT_ROLES) {
    out[key] = people
      .filter((p) => p.name.trim() && p.roles.includes(key))
      .map(({ roles: _roles, ...c }) => ({ ...c, name: c.name.trim() }))
  }
  return out
}

function PersonCard({
  person,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  person: Person
  index: number
  canRemove: boolean
  onChange: (patch: Partial<Person>) => void
  onRemove: () => void
}) {
  const title = person.name.trim() ? person.name.trim() : `Pessoa ${index + 1}`
  const toggleRole = (role: BriefingContactRole, on: boolean) =>
    onChange({ roles: on ? [...person.roles, role] : person.roles.filter((r) => r !== role) })

  return (
    <fieldset className="rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium text-slate-700">{title}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Nome">
          <Input id={`briefing-person-${person.id}`} value={person.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
        <Field label="WhatsApp">
          <Input
            value={person.whatsapp ?? ''}
            validate="phone"
            onChange={(e) => onChange({ whatsapp: maskPhone(e.target.value) })}
            placeholder="(00) 00000-0000"
          />
        </Field>
        <Field label="E-mail">
          <Input type="email" validate="email" value={person.email} onChange={(e) => onChange({ email: e.target.value })} />
        </Field>
        <Field label="Aniversário">
          <Input
            type="date"
            value={timestampToDateInput(person.birthday)}
            onChange={(e) => onChange({ birthday: dateInputToTimestamp(e.target.value) })}
          />
        </Field>
      </div>
      <fieldset className="mt-3">
        <legend className="mb-1.5 text-xs font-medium text-slate-600">O que {person.name.trim() || 'essa pessoa'} faz na empresa</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {BRIEFING_CONTACT_ROLES.map((r) => (
            <Checkbox key={r.key} label={r.label} checked={person.roles.includes(r.key)} onChange={(on) => toggleRole(r.key, on)} />
          ))}
        </div>
      </fieldset>
      {canRemove && (
        <Button variant="ghost" size="sm" className="mt-2 text-red-600" onClick={onRemove}>
          Remover {title}
        </Button>
      )}
    </fieldset>
  )
}

// ---------------------------------------------------------------- perguntas que saíram

/** Saíram do formulário em 22/10/2026 por quase nunca serem usadas. Só
 *  aparecem em "Respostas de perguntas antigas" quando já têm valor. */
const OLD_TEXT_FIELDS: { key: keyof PaidTrafficBriefing; label: string }[] = [
  { key: 'estruturaTime', label: 'Como o time comercial está estruturado' },
  { key: 'sistemaGestaoLeads', label: 'Sistema usado para gestão de leads' },
  { key: 'cicloVenda', label: 'Ciclo de venda' },
  { key: 'percepcaoMercado', label: 'Percepção da empresa perante o mercado' },
  { key: 'b2cEstadoCivilFilhos', label: 'Estado civil e filhos' },
  { key: 'b2cEscolaridadeProfissao', label: 'Escolaridade e profissão' },
  { key: 'b2bQuantidadeFuncionarios', label: 'Quantidade de funcionários' },
]

/** Quem o cliente atende. Briefings antigos não têm a resposta: deduz
 *  pelo que já foi preenchido. */
function publicoOf(b: PaidTrafficBriefing): PublicoAtendido | undefined {
  if (b.publicoAtendido) return b.publicoAtendido
  const pf = [b.b2cGenero, b.b2cFaixaEtaria, b.b2cRegiao, b.b2cEstadoCivilFilhos, b.b2cEscolaridadeProfissao].some(filled)
  const pj = [b.b2bSetor, b.b2bCargoDecisor, b.b2bLocalizacao, b.b2bQuantidadeFuncionarios, b.b2bFaturamentoMinimo].some(filled)
  if (pf && pj) return 'ambos'
  if (pj) return 'pj'
  if (pf) return 'pf'
  return undefined
}

// ---------------------------------------------------------------- painel

export function ClientPaidTrafficBriefingPanel({ client }: { client: Client }) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const initial = client.paidTrafficBriefing ?? EMPTY_PAID_TRAFFIC_BRIEFING
  const [form, setForm] = useState<PaidTrafficBriefing>({ ...initial, publicoAtendido: publicoOf(initial) })
  const [people, setPeople] = useState<Person[]>(() => toPeople(initial))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState('')
  useUnsavedWarning(dirty)

  // Resync só ao trocar de cliente: depender do objeto apagaria o que ainda
  // não foi salvo a cada snapshot de `clients`.
  useEffect(() => {
    const b = client.paidTrafficBriefing ?? EMPTY_PAID_TRAFFIC_BRIEFING
    setForm({ ...b, publicoAtendido: publicoOf(b) })
    setPeople(toPeople(b))
    setDirty(false)
    setResult('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id])

  const set = <K extends keyof PaidTrafficBriefing>(key: K, value: PaidTrafficBriefing[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setDirty(true)
  }
  const updatePerson = (id: string, patch: Partial<Person>) => {
    setPeople((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    setDirty(true)
  }
  const addPerson = () => {
    const p = newPerson()
    setPeople((list) => [...list, p])
    setDirty(true)
    requestAnimationFrame(() => document.getElementById(`briefing-person-${p.id}`)?.focus())
  }
  const removePerson = (id: string) => {
    setPeople((list) => list.filter((p) => p.id !== id))
    setDirty(true)
    requestAnimationFrame(() => document.getElementById('briefing-add-person')?.focus())
  }

  const publico = form.publicoAtendido
  const showPf = publico === 'pf' || publico === 'ambos'
  const showPj = publico === 'pj' || publico === 'ambos'

  const questions: [string, boolean][] = [
    ['pessoa de contato', people.some((p) => p.name.trim())],
    ['quem atende', !!publico],
    ['tempo de mercado', filled(form.tempoDeMercado)],
    ['clientes já atendidos', filled(form.clientesAtendidos)],
    ['canal que mais vende', filled(form.canalQueMaisVende)],
    ['como funciona a venda', filled(form.processoVendas)],
    ['objeção mais comum', filled(form.objecaoComum)],
    ['resultado esperado', filled(form.resultadoEsperado)],
    ['ticket médio', filled(form.ticketMedio)],
    ['cartão para os anúncios', filled(form.cartaoCreditoAnuncios)],
    ['dor principal do cliente', filled(form.b2cDorPrincipal)],
    ...(showPf ? ([['região dos clientes', filled(form.b2cRegiao)]] as [string, boolean][]) : []),
    ...(showPj ? ([['localização das empresas', filled(form.b2bLocalizacao)]] as [string, boolean][]) : []),
  ]
  const missing = questions.filter(([, ok]) => !ok).map(([n]) => n)

  const handleSave = async () => {
    if (!profile) return
    const noRole = people.find((p) => p.name.trim() && p.roles.length === 0)
    if (noRole) {
      const msg = `Marque o que ${noRole.name.trim()} faz na empresa antes de salvar.`
      setResult(msg)
      toast.error(msg)
      document.getElementById(`briefing-person-${noRole.id}`)?.focus()
      return
    }
    setSaving(true)
    try {
      const payload: PaidTrafficBriefing = {
        ...form,
        ...fromPeople(people),
        preenchidoPor: profile.name,
        filledAt: Timestamp.now(),
      }
      if (!payload.publicoAtendido) delete payload.publicoAtendido
      // Região/localização e site, Instagram e WhatsApp já entram no
      // Planejamento de Campanha, só nos campos que o gestor deixou vazios.
      const prefill = prefillPlanningFromBriefing(client, payload)
      await updateClient(
        client.id,
        prefill ? { paidTrafficBriefing: payload, campaignPlanning: prefill.planning } : { paidTrafficBriefing: payload },
        profile.id,
        profile.name
      )
      await markBriefingChecklistDone(client.id, profile.id, profile.name)
      await notifyBriefingFilled(client, profile.id, profile.name, users)
      // Aniversários dos responsáveis viram eventos recorrentes no calendário.
      await syncClientBirthdays(client, payload, profile.id).catch((err) =>
        console.error('[briefing] falha ao sincronizar aniversários', err)
      )
      setDirty(false)
      setResult(
        prefill
          ? `Briefing de ${client.companyName} salvo. O planejamento de campanha recebeu: ${prefill.filled.join(', ')}.`
          : `Briefing de ${client.companyName} salvo.`
      )
    } catch (err) {
      console.error(err)
      setResult('Erro ao salvar o briefing. Tente de novo.')
      toast.error('Erro ao salvar briefing')
    } finally {
      setSaving(false)
    }
  }

  const lastFilled = client.paidTrafficBriefing?.filledAt
  const lastSaved = lastFilled
    ? `Salvo por último por ${client.paidTrafficBriefing?.preenchidoPor} em ${format(lastFilled.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.`
    : 'Ainda não foi salvo.'

  const oldFields = OLD_TEXT_FIELDS.filter((f) => filled(initial[f.key]))
  const oldMoney = filled(initial.b2bFaturamentoMinimo)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-slate-600">
          Preenchido pelo CS durante ou logo depois da call de briefing. Nada é obrigatório: pule o que o cliente não souber.{' '}
          {lastSaved}
        </p>
        <BriefingProgress answered={questions.length - missing.length} missing={missing} />
      </div>

      <section>
        <SectionTitle>1. Pessoas de contato do cliente</SectionTitle>
        <p className="mb-3 text-sm text-slate-600">
          Cadastre cada pessoa uma vez só e marque tudo o que ela faz. Em empresa pequena, o dono costuma fazer tudo.
        </p>
        <div className="flex flex-col gap-3">
          {people.map((p, i) => (
            <PersonCard
              key={p.id}
              person={p}
              index={i}
              canRemove={people.length > 1}
              onChange={(patch) => updatePerson(p.id, patch)}
              onRemove={() => removePerson(p.id)}
            />
          ))}
        </div>
        <Button id="briefing-add-person" variant="ghost" size="sm" icon={<Plus size={13} />} onClick={addPerson} className="mt-2">
          Adicionar outra pessoa
        </Button>
      </section>

      <section>
        <SectionTitle>2. A empresa e as vendas</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tempo de mercado da empresa">
            <Input value={form.tempoDeMercado ?? ''} onChange={(e) => set('tempoDeMercado', e.target.value)} placeholder="Ex: 8 anos" />
          </Field>
          <Field label="Quantos clientes já atendeu">
            <Input value={form.clientesAtendidos ?? ''} onChange={(e) => set('clientesAtendidos', e.target.value)} placeholder="Ex: mais de 500" />
          </Field>
          <Field label="Canal que mais traz cliente hoje">
            <Input
              value={form.canalQueMaisVende ?? ''}
              onChange={(e) => set('canalQueMaisVende', e.target.value)}
              placeholder="Ex: indicação, Instagram, Google"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Como funciona a venda hoje: quem atende, como fecha e quanto tempo leva">
              <Textarea rows={2} value={form.processoVendas ?? ''} onChange={(e) => set('processoVendas', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Marcas conhecidas da região que já foram clientes">
              <Textarea
                rows={2}
                value={form.marcasAtendidasRegiao ?? ''}
                onChange={(e) => set('marcasAtendidasRegiao', e.target.value)}
                placeholder="Nomes que o público local reconhece, para usar como prova nos anúncios"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Desafios atuais">
              <Textarea rows={2} value={form.desafiosAtuais ?? ''} onChange={(e) => set('desafiosAtuais', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Objeção mais comum na venda">
              <Textarea rows={2} value={form.objecaoComum ?? ''} onChange={(e) => set('objecaoComum', e.target.value)} />
            </Field>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>3. Metas e números</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="O que espera como resultado">
              <Textarea rows={2} value={form.resultadoEsperado ?? ''} onChange={(e) => set('resultadoEsperado', e.target.value)} />
            </Field>
          </div>
          <Field label="Ticket médio em reais">
            <Input
              inputMode="decimal"
              value={moneyToMasked(form.ticketMedio)}
              onChange={(e) => set('ticketMedio', parseCurrencyToNumber(e.target.value))}
              placeholder="R$ 0,00"
            />
          </Field>
          <Field label="Faturamento mensal estimado em reais">
            <Input
              inputMode="decimal"
              value={moneyToMasked(form.faturamentoMensal)}
              onChange={(e) => set('faturamentoMensal', parseCurrencyToNumber(e.target.value))}
              placeholder="R$ 0,00"
            />
          </Field>
          <Field label="Meses de maior movimento">
            <Input value={form.mesesMaisFortes ?? ''} onChange={(e) => set('mesesMaisFortes', e.target.value)} />
          </Field>
          <Field label="Meses mais fracos">
            <Input value={form.mesesMaisFracos ?? ''} onChange={(e) => set('mesesMaisFracos', e.target.value)} />
          </Field>
          <Field label="Formas de pagamento aceitas">
            <Input value={form.formasPagamento ?? ''} onChange={(e) => set('formasPagamento', e.target.value)} placeholder="Ex: Pix, cartão em até 3 vezes" />
          </Field>
          <Field label="Tem cartão de crédito para pagar os anúncios?">
            <Select
              value={form.cartaoCreditoAnuncios ?? ''}
              onChange={(e) => set('cartaoCreditoAnuncios', (e.target.value || undefined) as CreditCardForAds | undefined)}
            >
              <option value="">Não respondido</option>
              {(Object.entries(CREDIT_CARD_FOR_ADS_LABEL) as [CreditCardForAds, string][]).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <section>
        <SectionTitle>4. Cliente ideal</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="A empresa atende quem?">
              <Select
                value={publico ?? ''}
                onChange={(e) => set('publicoAtendido', (e.target.value || undefined) as PublicoAtendido | undefined)}
              >
                <option value="">Não respondido</option>
                {(Object.entries(PUBLICO_ATENDIDO_LABEL) as [PublicoAtendido, string][]).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            {!publico && (
              <p className="mt-1 text-sm text-slate-600">Escolha uma opção para aparecerem as perguntas sobre o público.</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Field label="Dor principal do cliente antes de contratar">
              <Textarea rows={2} value={form.b2cDorPrincipal ?? ''} onChange={(e) => set('b2cDorPrincipal', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Soluções que o cliente já tentou antes">
              <Textarea rows={2} value={form.b2cSolucoesTentadas ?? ''} onChange={(e) => set('b2cSolucoesTentadas', e.target.value)} />
            </Field>
          </div>
        </div>

        {showPf && (
          <div className="mt-4">
            <SubTitle>Pessoa física</SubTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Cidades e bairros onde moram os clientes">
                  <Input value={form.b2cRegiao ?? ''} onChange={(e) => set('b2cRegiao', e.target.value)} />
                </Field>
              </div>
              <Field label="Faixa etária">
                <Input value={form.b2cFaixaEtaria ?? ''} onChange={(e) => set('b2cFaixaEtaria', e.target.value)} placeholder="Ex: 30 a 55 anos" />
              </Field>
              <Field label="Gênero">
                <Input value={form.b2cGenero ?? ''} onChange={(e) => set('b2cGenero', e.target.value)} placeholder="Ex: mais mulheres" />
              </Field>
            </div>
          </div>
        )}

        {showPj && (
          <div className="mt-4">
            <SubTitle>Empresas e condomínios</SubTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Tipo de empresa">
                <Input value={form.b2bSetor ?? ''} onChange={(e) => set('b2bSetor', e.target.value)} placeholder="Ex: condomínios, clínicas, escritórios" />
              </Field>
              <Field label="Cargo de quem contrata">
                <Input value={form.b2bCargoDecisor ?? ''} onChange={(e) => set('b2bCargoDecisor', e.target.value)} placeholder="Ex: síndico, gerente" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Cidades onde ficam as empresas">
                  <Input value={form.b2bLocalizacao ?? ''} onChange={(e) => set('b2bLocalizacao', e.target.value)} />
                </Field>
              </div>
            </div>
          </div>
        )}
      </section>

      <section>
        <SectionTitle>5. Observações gerais</SectionTitle>
        <Field label="Observações gerais">
          <Textarea rows={3} value={form.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} />
        </Field>
      </section>

      <OldAnswers count={oldFields.length + (oldMoney ? 1 : 0)}>
        {oldFields.map((f) => (
          <Field key={f.key} label={f.label}>
            <Textarea rows={2} value={(form[f.key] as string | undefined) ?? ''} onChange={(e) => set(f.key, e.target.value as never)} />
          </Field>
        ))}
        {oldMoney && (
          <Field label="Faturamento mínimo das empresas em reais">
            <Input
              value={moneyToMasked(form.b2bFaturamentoMinimo)}
              onChange={(e) => set('b2bFaturamentoMinimo', parseCurrencyToNumber(e.target.value))}
            />
          </Field>
        )}
      </OldAnswers>

      <SaveBar dirty={dirty} saving={saving} onSave={handleSave} savedMessage={result || lastSaved} />
    </div>
  )
}
