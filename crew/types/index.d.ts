export type AgentStatus = 'running' | 'done' | 'failed' | 'stopped'

export type Agent = {
  id: string
  /** The Agent call's short description. */
  task: string
  /** The agent type it was spawned as (Explore, general-purpose, ...). */
  type: string
  model: string
  /** The latest step's effort level, or '' for a model without one. */
  effort: string
  /** First line of the prompt it was given. */
  asked: string
  /** Its latest visible text. */
  said: string
  status: AgentStatus
  startedAt: number
  endedAt: number | null
  /** Estimated from its tokens at list price. */
  costUsd: number
  tokens: number
  calls: number
  /** The tool call running now, e.g. "Bash npm test". */
  tool: string | null
  toolAt: number | null
  /** The last few finished tool calls, oldest first. */
  recent: string[]
}

/** When the person last sent a message, last dismissed the band, and whether /crew pinned it open. */
export type Seen = { promptAt: number; dismissedAt: number; isPinned: boolean }

declare module 'claude-code' {
  interface PluginState {
    crew: { agents: Agent[]; isOpen: boolean; seen: Seen; now: number }
  }
}
