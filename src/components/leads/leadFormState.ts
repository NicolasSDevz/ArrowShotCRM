import { Timestamp } from 'firebase/firestore'
import { maskCurrencyInput, parseCurrencyToNumber } from '../../utils/masks'
import type { Lead, LeadInput, LeadSource } from '../../types'

export interface LeadFormState {
  contactName: string
  companyName: string
  whatsapp: string
  email: string
  cityRegion: string
  paidTraffic: boolean
  metaAds: boolean
  googleAds: boolean
  socialMedia: boolean
  socialMediaPackage: 'weekly' | 'monthly'
  landingPage: boolean
  source: LeadSource
  estimatedValueStr: string
  nextAction: string
  nextActionDateStr: string
  assignedTo: string
  notes: string
  contractedProductIds: string[]
  contractedDuration: string
}

/** O que o formulário edita — nunca inclui status/order/contactHistory/
 *  convertedClientId/convertedAt, que são geridos pelo Kanban, pelo mini-form
 *  de contato e pela conversão em cliente, não pela aba Informações. */
export type LeadEditableFields = Omit<LeadInput, 'status' | 'order' | 'contactHistory' | 'convertedClientId' | 'convertedAt'>

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

function moneyToMasked(v?: number): string {
  if (v == null) return ''
  return maskCurrencyInput(String(Math.round(v * 100)))
}

export function buildDefaultLeadForm(defaultAssignedTo?: string): LeadFormState {
  return {
    contactName: '',
    companyName: '',
    whatsapp: '',
    email: '',
    cityRegion: '',
    paidTraffic: false,
    metaAds: false,
    googleAds: false,
    socialMedia: false,
    socialMediaPackage: 'monthly',
    landingPage: false,
    source: 'instagram_organic',
    estimatedValueStr: '',
    nextAction: '',
    nextActionDateStr: '',
    assignedTo: defaultAssignedTo ?? '',
    notes: '',
    contractedProductIds: [],
    contractedDuration: '',
  }
}

export function leadToFormState(lead: Lead): LeadFormState {
  return {
    contactName: lead.contactName,
    companyName: lead.companyName ?? '',
    whatsapp: lead.whatsapp,
    email: lead.email ?? '',
    cityRegion: lead.cityRegion ?? '',
    paidTraffic: !!lead.services.paidTraffic,
    metaAds: !!lead.services.metaAds,
    googleAds: !!lead.services.googleAds,
    socialMedia: !!lead.services.socialMedia,
    socialMediaPackage: lead.services.socialMediaPackage ?? 'monthly',
    landingPage: !!lead.services.landingPage,
    source: lead.source,
    estimatedValueStr: moneyToMasked(lead.estimatedValue),
    nextAction: lead.nextAction ?? '',
    nextActionDateStr: lead.nextActionDate ? toDateStr(lead.nextActionDate.toDate()) : '',
    assignedTo: lead.assignedTo ?? '',
    notes: lead.notes ?? '',
    contractedProductIds: lead.contractedProductIds ?? [],
    contractedDuration: lead.contractedDuration ?? '',
  }
}

export function formStateToLeadFields(state: LeadFormState): LeadEditableFields {
  return {
    contactName: state.contactName.trim(),
    companyName: state.companyName.trim() || undefined,
    whatsapp: state.whatsapp,
    email: state.email.trim() || undefined,
    cityRegion: state.cityRegion.trim() || undefined,
    services: {
      paidTraffic: state.paidTraffic || undefined,
      metaAds: state.paidTraffic && state.metaAds ? true : undefined,
      googleAds: state.paidTraffic && state.googleAds ? true : undefined,
      socialMedia: state.socialMedia || undefined,
      socialMediaPackage: state.socialMedia ? state.socialMediaPackage : undefined,
      landingPage: state.landingPage || undefined,
    },
    source: state.source,
    estimatedValue: parseCurrencyToNumber(state.estimatedValueStr),
    nextAction: state.nextAction.trim() || undefined,
    nextActionDate: state.nextActionDateStr ? Timestamp.fromDate(new Date(`${state.nextActionDateStr}T00:00:00`)) : null,
    assignedTo: state.assignedTo || undefined,
    notes: state.notes.trim() || undefined,
    contractedProductIds: state.contractedProductIds.length > 0 ? state.contractedProductIds : undefined,
    contractedDuration: state.contractedDuration.trim() || undefined,
  }
}
