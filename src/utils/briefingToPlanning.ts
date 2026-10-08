import {
  EMPTY_CAMPAIGN_PLANNING,
  EMPTY_GOOGLE_ADS_PLANNING,
  EMPTY_META_ADS_PLANNING,
  type CampaignPlanning,
} from '../types/campaignPlanning'
import type { PaidTrafficBriefing } from '../types/paidTrafficBriefing'
import type { Client } from '../types/client'
import { maskPhone } from './masks'
import { trafficServices } from './clientServices'

/** "@loja", "loja" ou "instagram.com/loja" viram https://instagram.com/loja. */
function instagramToLink(raw?: string): string {
  const v = raw?.trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  if (/instagram\.com\//i.test(v)) return `https://${v.replace(/^\/+/, '')}`
  return `https://instagram.com/${v.replace(/^@/, '')}`
}

const blank = (v?: string) => !v || !v.trim()

/** Quando o CS salva o Briefing de Tráfego Pago, parte dos dados já entra no
 *  Planejamento de Campanha: Região (ICP B2C) e Localização (ICP B2B) viram
 *  "Cidades desejadas" do Meta e/ou Google (só das plataformas contratadas),
 *  e site, Instagram e WhatsApp do cadastro vão pra seção Acessos. Só
 *  preenche campo vazio, nunca sobrescreve o que o gestor já digitou.
 *  Devolve null quando não há nada novo pra preencher. */
export function prefillPlanningFromBriefing(
  client: Client,
  briefing: PaidTrafficBriefing
): { planning: CampaignPlanning; filled: string[] } | null {
  const saved = client.campaignPlanning
  const planning: CampaignPlanning = {
    ...EMPTY_CAMPAIGN_PLANNING,
    ...saved,
    acessos: { ...saved?.acessos },
    metaAds: { ...EMPTY_META_ADS_PLANNING, ...saved?.metaAds, campanhas: saved?.metaAds?.campanhas ?? [] },
    googleAds: { ...EMPTY_GOOGLE_ADS_PLANNING, ...saved?.googleAds, campanhas: saved?.googleAds?.campanhas ?? [] },
  }
  const filled: string[] = []

  const cidades = [...new Set([briefing.b2cRegiao, briefing.b2bLocalizacao].map((s) => s?.trim()).filter(Boolean))].join('\n')
  if (cidades) {
    const svc = trafficServices(client)
    if (svc.meta && blank(planning.metaAds.cidadesDesejadas)) {
      planning.metaAds.cidadesDesejadas = cidades
      filled.push('cidades do Meta Ads')
    }
    if (svc.google && blank(planning.googleAds.cidadesDesejadas)) {
      planning.googleAds.cidadesDesejadas = cidades
      filled.push('cidades do Google Ads')
    }
  }

  const site = client.website?.trim()
  if (site && blank(planning.acessos.siteUrl)) {
    planning.acessos.siteUrl = site
    filled.push('site')
  }
  const insta = instagramToLink(client.instagram)
  if (insta && blank(planning.acessos.instagramLink)) {
    planning.acessos.instagramLink = insta
    filled.push('Instagram')
  }
  const whats = client.whatsapp ? maskPhone(client.whatsapp) : ''
  if (whats && blank(planning.acessos.whatsappNumero)) {
    planning.acessos.whatsappNumero = whats
    filled.push('WhatsApp')
  }

  return filled.length ? { planning, filled } : null
}
