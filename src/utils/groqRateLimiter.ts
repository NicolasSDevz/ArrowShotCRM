import { transcribeAudio, GroqRateLimitClientError } from '../services/groqTranscriptionService'

/** Margem de segurança abaixo do limite real do Groq (20 req/min, conta
 *  toda) — Bruno e Cliente somados passam por essa mesma fila. */
const MAX_REQUESTS_PER_MINUTE = 15
/** Um retry-after maior que isso não parece "espera um pouco" (throttle de
 *  minuto) — tratamos como limite diário/por hora esgotado e pausamos. */
const DAILY_LIMIT_RETRY_THRESHOLD_SEC = 60

const STORAGE_KEY = 'copiloto_groq_daily_usage'

interface DailyUsage {
  date: string
  requests: number
  audioSeconds: number
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function loadDaily(): DailyUsage {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DailyUsage
      if (parsed.date === todayKey()) return parsed
    }
  } catch {
    /* sem storage: só não persiste entre chamadas do mesmo dia */
  }
  return { date: todayKey(), requests: 0, audioSeconds: 0 }
}

function saveDaily(usage: DailyUsage) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage))
  } catch {
    /* ignora */
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface GroqQueueStatus {
  requestsThisMinute: number
  audioSecondsToday: number
  dailyLimitReached: boolean
}

interface QueueItem {
  audio: Float32Array
  durationSec: number
  resolve: (text: string) => void
  reject: (err: unknown) => void
}

/** Fila única (Bruno + Cliente somados) que respeita o limite de
 *  requisições/minuto do Groq, reenvia sozinha em 429 (esperando o
 *  retry-after) e pausa (sem travar a UI) se parecer limite diário/por
 *  hora. Uma instância por chamada — ver hooks/useCopiloto.ts. */
export class GroqTranscriptionQueue {
  private queue: QueueItem[] = []
  private requestTimestamps: number[] = []
  private daily: DailyUsage = loadDaily()
  private processing = false
  private dailyLimitReached = false
  private onStatusChange?: (status: GroqQueueStatus) => void

  constructor(onStatusChange?: (status: GroqQueueStatus) => void) {
    this.onStatusChange = onStatusChange
    this.emitStatus()
  }

  get isPaused() {
    return this.dailyLimitReached
  }

  enqueue(audio: Float32Array, durationSec: number): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.dailyLimitReached) {
        reject(new Error('Transcrição pausada: limite diário atingido'))
        return
      }
      this.queue.push({ audio, durationSec, resolve, reject })
      void this.pump()
    })
  }

  private emitStatus() {
    this.onStatusChange?.({
      requestsThisMinute: this.requestTimestamps.length,
      audioSecondsToday: this.daily.audioSeconds,
      dailyLimitReached: this.dailyLimitReached,
    })
  }

  private pruneWindow() {
    const cutoff = Date.now() - 60_000
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > cutoff)
  }

  private async pump() {
    if (this.processing) return
    this.processing = true
    try {
      while (this.queue.length > 0 && !this.dailyLimitReached) {
        this.pruneWindow()
        if (this.requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
          const oldest = this.requestTimestamps[0]
          const waitMs = Math.max(60_000 - (Date.now() - oldest) + 100, 250)
          await sleep(waitMs)
          continue
        }
        const item = this.queue.shift()
        if (item) await this.send(item)
      }
    } finally {
      this.processing = false
    }
  }

  private async send(item: QueueItem, attempt = 0): Promise<void> {
    this.pruneWindow()
    this.requestTimestamps.push(Date.now())
    this.daily = { ...this.daily, requests: this.daily.requests + 1, audioSeconds: this.daily.audioSeconds + item.durationSec }
    saveDaily(this.daily)
    this.emitStatus()

    try {
      const text = await transcribeAudio(item.audio)
      item.resolve(text)
    } catch (err) {
      if (err instanceof GroqRateLimitClientError) {
        if (err.retryAfterSec > DAILY_LIMIT_RETRY_THRESHOLD_SEC) {
          this.dailyLimitReached = true
          this.emitStatus()
          item.reject(err)
          // Esvazia o resto da fila — nada vai transcrever enquanto o
          // limite não volta; o chamador já sabe (reject) e segue
          // salvando o que já tem.
          this.queue.forEach((pending) => pending.reject(err))
          this.queue = []
          return
        }
        await sleep((err.retryAfterSec + 0.5) * 1000)
        return this.send(item, attempt + 1)
      }
      item.reject(err)
    }
  }
}
