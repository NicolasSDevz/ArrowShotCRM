import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Lock } from 'lucide-react'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { Spinner } from '../ui/FullPageSpinner'
import { useAuth } from '../../context/AuthContext'
import { useMemberHealth } from '../../hooks/useMemberHealth'
import { saveMemberHealth } from '../../services/memberHealthService'
import { notifyAdminsOfAction } from '../../services/notificationService'
import { maskPhone } from '../../utils/masks'
import { BLOOD_TYPES, type BloodType, type MemberHealth } from '../../types'

type HealthPlanChoice = '' | 'yes' | 'no'

const EMPTY = {
  bloodType: '' as BloodType | '',
  allergies: '',
  healthConditions: '',
  continuousMedications: '',
  emergencyContactName: '',
  emergencyContactRelationship: '',
  emergencyContactWhatsapp: '',
  emergencyAltPhone: '',
  hasHealthPlan: '' as HealthPlanChoice,
  healthPlanName: '',
  healthPlanCardNumber: '',
  medicalNotes: '',
}

function fromRecord(h: MemberHealth | null): typeof EMPTY {
  if (!h) return EMPTY
  return {
    bloodType: h.bloodType ?? '',
    allergies: h.allergies ?? '',
    healthConditions: h.healthConditions ?? '',
    continuousMedications: h.continuousMedications ?? '',
    emergencyContactName: h.emergencyContactName ?? '',
    emergencyContactRelationship: h.emergencyContactRelationship ?? '',
    emergencyContactWhatsapp: h.emergencyContactWhatsapp ?? '',
    emergencyAltPhone: h.emergencyAltPhone ?? '',
    hasHealthPlan: h.hasHealthPlan === undefined ? '' : h.hasHealthPlan ? 'yes' : 'no',
    healthPlanName: h.healthPlanName ?? '',
    healthPlanCardNumber: h.healthPlanCardNumber ?? '',
    medicalNotes: h.medicalNotes ?? '',
  }
}

const trimmed = (s: string) => {
  const t = s.trim()
  return t === '' ? undefined : t
}

export function MemberHealthTab({ memberId, memberName }: { memberId: string; memberName: string }) {
  const { profile } = useAuth()
  const { data, loading, denied } = useMemberHealth(memberId)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(fromRecord(data))
  }, [data, memberId])

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  if (denied) {
    return (
      <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
        Você não tem permissão para ver estas informações.
      </p>
    )
  }

  if (loading) return <Spinner />

  const hasPlan = form.hasHealthPlan === 'yes'

  const handleSubmit = async () => {
    if (!profile) return
    setSaving(true)
    try {
      const payload: MemberHealth = {
        bloodType: form.bloodType || undefined,
        allergies: trimmed(form.allergies),
        healthConditions: trimmed(form.healthConditions),
        continuousMedications: trimmed(form.continuousMedications),
        emergencyContactName: trimmed(form.emergencyContactName),
        emergencyContactRelationship: trimmed(form.emergencyContactRelationship),
        emergencyContactWhatsapp: trimmed(form.emergencyContactWhatsapp),
        emergencyAltPhone: trimmed(form.emergencyAltPhone),
        hasHealthPlan: form.hasHealthPlan === '' ? undefined : hasPlan,
        healthPlanName: hasPlan ? trimmed(form.healthPlanName) : undefined,
        healthPlanCardNumber: hasPlan ? trimmed(form.healthPlanCardNumber) : undefined,
        medicalNotes: trimmed(form.medicalNotes),
      }
      const first = !data
      await saveMemberHealth(memberId, payload, profile.id)
      await notifyAdminsOfAction({
        type: 'member_health_updated',
        message: `${profile.name} ${first ? 'preencheu' : 'atualizou'} as informações de saúde de ${memberName}`,
        actorId: profile.id,
        actorName: profile.name,
      })
      toast.success('Informações de saúde salvas')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar informações de saúde')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
        <Lock size={14} className="mt-0.5 shrink-0" />
        <span>🔒 Estas informações são confidenciais e visíveis apenas para administradores.</span>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Informações básicas de saúde
        </h3>
        <Field label="Tipo sanguíneo">
          <Select value={form.bloodType} onChange={(e) => set('bloodType', e.target.value as BloodType | '')}>
            <option value="">—</option>
            {BLOOD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Alergias (listar todas)">
          <Textarea rows={2} value={form.allergies} onChange={(e) => set('allergies', e.target.value)} />
        </Field>
        <Field label="Condições de saúde relevantes (ex: diabetes, hipertensão, epilepsia)">
          <Textarea
            rows={2}
            value={form.healthConditions}
            onChange={(e) => set('healthConditions', e.target.value)}
          />
        </Field>
        <Field label="Medicamentos de uso contínuo">
          <Textarea
            rows={2}
            value={form.continuousMedications}
            onChange={(e) => set('continuousMedications', e.target.value)}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Em caso de emergência</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome do contato de emergência">
            <Input
              value={form.emergencyContactName}
              onChange={(e) => set('emergencyContactName', e.target.value)}
            />
          </Field>
          <Field label="Parentesco">
            <Input
              value={form.emergencyContactRelationship}
              onChange={(e) => set('emergencyContactRelationship', e.target.value)}
            />
          </Field>
          <Field label="WhatsApp do contato de emergência">
            <Input
              value={form.emergencyContactWhatsapp}
              onChange={(e) => set('emergencyContactWhatsapp', maskPhone(e.target.value))}
              placeholder="(00) 00000-0000"
              inputMode="tel"
            />
          </Field>
          <Field label="Telefone alternativo">
            <Input
              value={form.emergencyAltPhone}
              onChange={(e) => set('emergencyAltPhone', maskPhone(e.target.value))}
              placeholder="(00) 00000-0000"
              inputMode="tel"
            />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Plano de saúde</h3>
        <Field label="Possui plano de saúde?">
          <Select
            value={form.hasHealthPlan}
            onChange={(e) => set('hasHealthPlan', e.target.value as HealthPlanChoice)}
          >
            <option value="">—</option>
            <option value="yes">Sim</option>
            <option value="no">Não</option>
          </Select>
        </Field>
        {hasPlan && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nome do plano">
              <Input value={form.healthPlanName} onChange={(e) => set('healthPlanName', e.target.value)} />
            </Field>
            <Field label="Número da carteirinha">
              <Input
                value={form.healthPlanCardNumber}
                onChange={(e) => set('healthPlanCardNumber', e.target.value)}
              />
            </Field>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Observações médicas adicionais
        </h3>
        <Field label="Observações">
          <Textarea rows={3} value={form.medicalNotes} onChange={(e) => set('medicalNotes', e.target.value)} />
        </Field>
      </section>

      <div className="flex justify-end">
        <Button onClick={handleSubmit} loading={saving}>
          Salvar informações de saúde
        </Button>
      </div>
    </div>
  )
}
