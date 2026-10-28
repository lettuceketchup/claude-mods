export type Limit = { kind: string; pct: number; resetsAt: number | null }

export type Vitals = {
  pct: number | null
  tokens: number | null
  window: number
  costUsd: number | null
  limits: Limit[]
  compactions: number
  /** When the main loop last replied, ms since the epoch; the cache timer runs from here. */
  lastReplyAt: number | null
  /** Session cost when the latest main turn started; cost minus this is that turn's spend. */
  costAtTurnStart: number | null
  /** Spend of the turns before the latest one, oldest first, at most 12. */
  turnCosts: number[]
  /** Cache lifetime in minutes as observed from cache hits and misses; null until one tells. */
  ttlMin: number | null
}

declare module 'claude-code' {
  interface PluginState {
    meter: { vitals: Vitals; isOpen: boolean; now: number }
  }
}
