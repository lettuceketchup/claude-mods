import { atom, read, update } from 'claude-code'
import type { BoxProps, ButtonProps, ElementConstructor, EngineInterface, Register, SvgProps, TextProps } from 'claude-code'

import type { Agent, AgentStatus, Seen } from '../types'

const agents = atom({ plugin: 'crew', key: 'agents' } as const, [] as Agent[])
const isOpen = atom({ plugin: 'crew', key: 'isOpen' } as const, false)
const seen = atom({ plugin: 'crew', key: 'seen' } as const, { promptAt: 0, dismissedAt: 0, isPinned: false } as Seen)
// Bumped every second while an agent runs, so its timer moves.
const tick = atom({ plugin: 'crew', key: 'now' } as const, 0)

const pad = (n: number) => String(n).padStart(2, '0')
const dur = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 3600 ? `${Math.floor(s / 60)}m ${pad(s % 60)}s` : `${Math.floor(s / 3600)}h ${pad(Math.floor((s % 3600) / 60))}m`
}
const usd = (n: number) => (n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`)
const k = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`)
const short = (s: string, n: number) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, n - 1)}…` : one
}

// ponytail: list prices per MTok (input, output, cache read), first match wins; cache writes are priced
// at the 1-hour rate (2x input). Update the table when prices change; unknown models use Sonnet 4 rates.
const PRICES: [RegExp, number, number, number][] = [
  [/fable|mythos/i, 10, 50, 0.25],
  [/opus-5-5/i, 4, 20, 0.2],
  [/opus/i, 5, 25, 0.5],
  [/sonnet-4/i, 3, 15, 0.3],
  [/sonnet/i, 2, 10, 0.2],
  [/haiku-5/i, 0.1, 0.5, 0.01],
  [/haiku/i, 1, 5, 0.1],
]
type Usage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
const stepCost = (model: string, u: Usage) => {
  const [, i, o, r] = PRICES.find(([re]) => re.test(model)) ?? [null, 3, 15, 0.3]
  return ((u.input_tokens ?? 0) * i + (u.output_tokens ?? 0) * o + (u.cache_read_input_tokens ?? 0) * r + (u.cache_creation_input_tokens ?? 0) * i * 2) / 1e6
}

// Colour means the model, everywhere: lavender Opus, blue Sonnet, sage Haiku. The effort half of the model
// pill deepens with effort, so OPUS · HIGH and OPUS · MED read apart at a glance.
type Fam = 'opus' | 'sonnet' | 'haiku' | 'other'
type Level = 'low' | 'medium' | 'high' | 'max'
const FAM: Record<Fam, { hue: string; ink: string; tint: string; eff: Record<Level, [string, string]> }> = {
  opus: { hue: '#b7a2dc', ink: '#6b4f99', tint: '#e6ddf4', eff: { low: ['#d9cdee', '#6b4f99'], medium: ['#b7a2dc', '#3f2a66'], high: ['#8e74c0', '#fff'], max: ['#5e4592', '#fff'] } },
  sonnet: { hue: '#8ab6dc', ink: '#3c6e99', tint: '#d5e6f4', eff: { low: ['#c3daee', '#3c6e99'], medium: ['#8ab6dc', '#1f4366'], high: ['#5a8fbf', '#fff'], max: ['#3c6e99', '#fff'] } },
  haiku: { hue: '#8fbc94', ink: '#4d7a55', tint: '#d5e8d7', eff: { low: ['#c1dcc4', '#4d7a55'], medium: ['#8fbc94', '#2a4a30'], high: ['#5f9467', '#fff'], max: ['#4d7a55', '#fff'] } },
  other: { hue: '#b5b5b0', ink: '#666666', tint: '#e6e6e3', eff: { low: ['#dcdcd8', '#666666'], medium: ['#c4c4bf', '#444444'], high: ['#999994', '#fff'], max: ['#6e6e6a', '#fff'] } },
}
const famOf = (model: string): Fam => (/opus/i.test(model) ? 'opus' : /sonnet/i.test(model) ? 'sonnet' : /haiku/i.test(model) ? 'haiku' : 'other')
const famName = (model: string) => (famOf(model) === 'other' ? (/fable|mythos/i.exec(model)?.[0] ?? 'model') : famOf(model)).toUpperCase()
const level = (e: string): Level => (e === 'xhigh' || e === 'max' ? 'max' : e === 'high' ? 'high' : e === 'low' ? 'low' : 'medium')
const effName = (e: string) => ({ low: 'LOW', medium: 'MED', high: 'HIGH', xhigh: 'XHIGH', max: 'MAX' } as Record<string, string>)[e] ?? e.toUpperCase()
const STATUS: Record<AgentStatus, [string, string, string]> = {
  running: ['#d5e6f4', '#3c6e99', 'LIVE'],
  done: ['#d5e8d7', '#4d7a55', 'DONE'],
  failed: ['#f6d6d1', '#a8493d', 'FAILED'],
  stopped: ['#e6e6e3', '#777777', 'STOPPED'],
}
const RED = { ink: '#a8493d' }

type Art = { source: string; width: number; height: number; title: string }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// The size goes on the element too: without it the surface stretches the image to the slot.
const svg = (width: number, height: number, body: string, tip = ''): Art => ({
  source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${tip ? `<title>${esc(tip)}</title>` : ''}<rect width="${width}" height="${height}" fill="transparent"/>${body}</svg>`,
  width,
  height,
  title: tip,
})
const FONT = 'font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="10.5" font-weight="700" letter-spacing="1.1"'
// A picture can't read the theme, but the app's colour scheme reaches it: each pill carries its dark colours as
// class rules, which win over the fill attributes holding the light ones.
const mix = (a: string, b: string, t: number) =>
  '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('')
const SHADE = '#262624'
const darkCss = (rules: Record<string, string>) =>
  `<style>@media (prefers-color-scheme: dark){${Object.entries(rules).map(([c, v]) => `.${c}{fill:${v}}`).join('')}}</style>`
const label = (x: number, text: string, fill: string, cls = '') => `<text x="${x}" y="14" text-anchor="middle" ${FONT} fill="${fill}" class="${cls}">${esc(text)}</text>`
const dot = (hex: string, tip = '') => svg(8, 8, `<circle cx="4" cy="4" r="3.5" fill="${hex}"/>`, tip)
const PILL_W = 124
const SPLIT = 66
/** Model name on its tint, effort on a deeper shade of the same hue; one width so the column lines up. */
const MARK: Record<AgentStatus, string> = { running: '●', done: '✓', failed: '✗', stopped: '■' }
const modelPill =(a: Agent, tip: string, hasEffort = true) => {
  const f = FAM[famOf(a.model)]
  const dark = darkCss({ t: mix(f.hue, SHADE, 0.7), i: mix(f.hue, '#ffffff', 0.35) })
  if (!a.effort || !hasEffort) {
    const w = hasEffort ? PILL_W : SPLIT
    return svg(w, 20, `${dark}<rect class="t" width="${w}" height="20" rx="5" fill="${f.tint}"/>${label(w / 2, famName(a.model), f.ink, 'i')}`, tip)
  }
  const [bg, fg] = f.eff[level(a.effort)]
  const effDark = darkCss({ e: mix(bg, SHADE, 0.45), f: '#f2f2ef' })
  return svg(PILL_W, 20,
    `${dark}${effDark}<rect class="t" width="${PILL_W}" height="20" rx="5" fill="${f.tint}"/><rect class="e" x="${SPLIT}" width="${PILL_W - SPLIT}" height="20" rx="5" fill="${bg}"/><rect class="e" x="${SPLIT}" width="6" height="20" fill="${bg}"/>` +
    label(SPLIT / 2, famName(a.model), f.ink, 'i') + label(SPLIT + (PILL_W - SPLIT) / 2, effName(a.effort), fg, 'f'), tip)
}
const statusPill = (s: AgentStatus) => {
  const [bg, fg, text] = STATUS[s]
  return svg(76, 20, `${darkCss({ t: mix(fg, SHADE, 0.55), i: mix(bg, '#ffffff', 0.3) })}<rect class="t" width="76" height="20" rx="5" fill="${bg}"/>${label(38, text, fg, 'i')}`)
}

const blank = (id: string, now: number): Agent => ({
  id, task: 'agent', type: '', model: '', effort: '', asked: '', said: '', status: 'running',
  startedAt: now, endedAt: null, costUsd: 0, tokens: 0, calls: 0, tool: null, toolAt: null, recent: [],
})
const describe = (tool: string, input: Record<string, unknown>) => {
  const path = typeof input.file_path === 'string' ? input.file_path.split(/[\\/]/).slice(-2).join('/') : ''
  const what = typeof input.command === 'string' ? input.command
    : path || (typeof input.pattern === 'string' ? input.pattern : typeof input.url === 'string' ? input.url : typeof input.description === 'string' ? input.description : '')
  return short(what ? `${tool} ${what}` : tool, 70)
}

function edit($: EngineInterface, id: string, fn: (a: Agent) => Agent) {
  return update($, agents, list => list.map(a => (a.id === id ? fn(a) : a)))
}
async function known($: EngineInterface, id: string | undefined) {
  return Boolean(id && (await read($, agents)).some(a => a.id === id))
}

/** True when a tree shows nothing: no text, button or drawing anywhere in it (the band's empty answer beneath). */
const isEmpty = (t: unknown): boolean => {
  if (t === null || t === undefined || t === false) return true
  if (typeof t === 'string' || typeof t === 'number') return String(t).trim() === ''
  if (Array.isArray(t)) return t.every(isEmpty)
  if (typeof t !== 'object') return true
  const el = t as { type?: string; props?: { label?: unknown }; children?: unknown }
  // The engine's own slot is an opaque handle; it drew nothing here before mods stacked.
  if (el.type === 'engine') return true
  if (el.type && el.type !== 'Box' && el.type !== 'Text') return false
  return isEmpty(el.children)
}

/** Rows a tree takes, roughly: column Boxes stack their children, row Boxes take the tallest; a wrapped row counts once. */
const rowsOf = (t: unknown, isColumn = true): number => {
  if (t === null || t === undefined || typeof t === 'boolean') return 0
  if (Array.isArray(t)) {
    const each = t.map(c => rowsOf(c, isColumn))
    return isColumn ? each.reduce((a, b) => a + b, 0) : Math.max(0, ...each)
  }
  if (typeof t !== 'object') return String(t).trim() ? 1 : 0
  const el = t as { type?: string; props?: Record<string, unknown>; children?: unknown }
  if (el.type === 'engine') return 0
  if (el.type !== 'Box') return 1
  const p = el.props ?? {}
  if (p.display === 'none' || p.position === 'absolute') return 0
  const n = (v: unknown) => (typeof v === 'number' ? v : v ? 1 : 0)
  const isCol = p.flexDirection === 'column'
  const kids = ([] as unknown[]).concat(el.children ?? []).filter(c => rowsOf(c, isCol) > 0)
  const inner = isCol
    ? kids.reduce<number>((a, c) => a + rowsOf(c, true), 0) + n(p.rowGap ?? p.gap) * Math.max(0, kids.length - 1)
    : Math.max(0, ...kids.map(c => rowsOf(c, false)))
  return inner + n(p.marginTop) + n(p.marginBottom) + 2 * n(p.marginY) + n(p.paddingTop) + n(p.paddingBottom) + 2 * n(p.paddingY) + (p.borderStyle ? 2 : 0)
}

type Els = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps>; Button: ElementConstructor<ButtonProps>; Svg: ElementConstructor<SvgProps> | null }
const PANE = 'crew-history'
// A hairline wider than any band, cut to the band's width by the Box around it (a picture given no width is
// drawn at its default 300px, not the band's).
const RULE = '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="13" viewBox="0 0 4000 13" preserveAspectRatio="none"><rect y="6" width="4000" height="1" fill="#cfcfcb"/></svg>'

/** The pieces the band and the history pane both draw with. */
function kit(els: Els, now: number, cols: number) {
  const { Box, Text, Svg } = els
  // Desktop leaves out a picture whose alt is empty, so the text stands in. Only a picture with a tooltip
  // goes in a frame (isInteractive); a frame reloads, blank for a moment, whenever its markup changes.
  const art = (key: string, a: Art, text: string, color: string) =>
    Svg ? <Svg key={key} source={a.source} width={a.width} height={a.height} alt={a.title || text} isInteractive={a.title !== ''} /> : <Text key={key} color={color}>{text}</Text>
  // Narrow rows shed rather than squeeze: the tool column first, then the agent type, then the pill's effort.
  // Desktop cells are about 8px (a divider sized at 7 per cell came up an eighth short).
  const pill = Svg ? 16 : 10
  // Running rows: the dot, the pill, time, cost, five gaps and the padding.
  const fixed = 2 + pill + 8 + 7 + 10 + 2
  const hasTool = cols * 0.68 - fixed >= 14
  const taskCells = hasTool ? cols * 0.32 : cols - fixed
  const hasType = taskCells >= 28
  // The effort goes only once a task name would be cut to a stub. History rows have no tool column: where
  // running rows drop theirs, the task name takes the room left over, so the effort stays down to a narrow band.
  const hasEffort = taskCells >= 10
  // History rows shed by what's left for the task name: the effort first, then the status pill, whose
  // place the row's mark takes (✓ ✗ ■). A sidebar pane is about 48 cells, too few for both.
  const pastRoom = (isFull: boolean, hasStatus: boolean) =>
    cols - (2 + 1 + (Svg ? (isFull ? 16 : 9) : isFull ? 10 : 6) + (hasStatus ? (Svg ? 10 : 7) + 2 : 0) + 8 + 7 + 8)
  const hasPastStatus = pastRoom(false, true) >= 14
  const hasPastEffort = pastRoom(true, hasPastStatus) >= 14
  const took = (a: Agent) => (a.endedAt ?? now) - a.startedAt
  const dotOf = (a: Agent, key: string) => art(key, dot(FAM[famOf(a.model)].hue), '●', FAM[famOf(a.model)].ink)
  const pillOf = (a: Agent, key: string, tip: string, isFull = hasEffort) => art(key, modelPill(a, tip, isFull), a.effort && isFull ? `${famName(a.model)}·${effName(a.effort)}` : famName(a.model), FAM[famOf(a.model)].ink)
  const sum = (list: Agent[]) => list.reduce((n, a) => n + a.costUsd, 0)
  const head = (t: string) => <Text size="caption" weight="bold" dimColor>{t}</Text>
  // The pill's tooltip is in its markup: while the agent runs it holds only what stays put, or the pill flickers.
  const tipOf = (a: Agent) => [
    a.task,
    a.asked && `Asked: ${a.asked}`,
    a.status !== 'running' && a.said && `Last said: ${a.said}`,
    a.status !== 'running' && `${a.calls} tool calls · ${k(a.tokens)} tokens`,
    `${a.type || 'agent'} · started ${new Date(a.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`,
  ].filter(Boolean).join('\n')
  const task = (a: Agent, isBold: boolean, isFluid = false) => (
    <Box key="task" width={isFluid ? undefined : '32%'} flexGrow={isFluid ? 1 : 0} minWidth={0} flexShrink={1}>
      <Box key="name" minWidth={0} flexShrink={1}><Text wrap="truncate" weight={isBold ? 'semibold' : 'regular'}>{a.task}</Text></Box>
      {a.type && hasType ? <Box key="type" minWidth={0} flexShrink={100}><Text wrap="truncate" dimColor>{` · ${a.type}`}</Text></Box> : null}
    </Box>
  )
  // A running line; its pill's tooltip has the task, what it was asked and when it started.
  const liveRow = (a: Agent) => {
    const [name, ...rest] = (a.tool ?? (a.recent.at(-1) ? a.recent.at(-1)! : 'starting…')).split(' ')
    return (
      <Box key={`r-${a.id}`} gap={2} alignItems="center" paddingX={1}>
        {dotOf(a, `rd-${a.id}`)}
        {task(a, true, !hasTool)}
        {pillOf(a, `rp-${a.id}`, tipOf(a))}
        {hasTool && <Box key="tool" width={0} minWidth={0} flexGrow={1} flexShrink={1} gap={1} overflow="hidden">
          <Box key="name" flexShrink={0}><Text mono size="footnote" weight="bold" dimColor={!a.tool}>{name}</Text></Box>
          {rest.length ? <Box key="args" minWidth={0} flexShrink={1}><Text mono size="footnote" wrap="truncate" dimColor={!a.tool}>{rest.join(' ')}</Text></Box> : null}
          {a.tool && a.toolAt ? <Box key="for" flexShrink={0}><Text mono size="footnote" dimColor>{`· ${dur(now - a.toolAt)}`}</Text></Box> : null}
        </Box>}
        <Box key="time" width={8} justifyContent="flex-end" flexShrink={0}><Text tabular>{dur(took(a))}</Text></Box>
        <Box key="cost" width={7} justifyContent="flex-end" flexShrink={0}><Text weight="bold" tabular>{usd(a.costUsd)}</Text></Box>
      </Box>
    )
  }
  // The task name takes the spare room, so the pills sit at the right beside time and cost.
  const pastRow = (a: Agent) => (
    <Box key={`h-${a.id}`} gap={2} alignItems="center" paddingX={1}>
      {hasPastStatus ? dotOf(a, `hd-${a.id}`) : <Text key={`hd-${a.id}`} color={STATUS[a.status][1]}>{MARK[a.status]}</Text>}
      {task(a, false, true)}
      <Box key="pill" flexShrink={0}>{pillOf(a, `hp-${a.id}`, tipOf(a), hasPastEffort)}</Box>
      {hasPastStatus && <Box key="status" flexShrink={0}>{art(`hs-${a.id}`, statusPill(a.status), STATUS[a.status][2], STATUS[a.status][1])}</Box>}
      <Box key="time" width={8} justifyContent="flex-end" flexShrink={0}><Text tabular size="footnote">{dur(took(a))}</Text></Box>
      <Box key="cost" width={7} justifyContent="flex-end" flexShrink={0}><Text weight="bold" tabular size="footnote">{usd(a.costUsd)}</Text></Box>
    </Box>
  )
  const totals = (all: Agent[]) => {
    const byFam = (['opus', 'sonnet', 'haiku', 'other'] as Fam[]).map(f => [f, sum(all.filter(a => famOf(a.model) === f))] as const).filter(([, n]) => n > 0)
    return (
      <Box key="totals" marginTop={1} columnGap={3} flexWrap="wrap" paddingX={1}>
        <Text size="footnote"><Text weight="bold">{all.length}</Text><Text dimColor> agents</Text></Text>
        <Text size="footnote"><Text weight="bold" tabular>{dur(all.reduce((n, a) => n + took(a), 0))}</Text><Text dimColor> total</Text></Text>
        <Text size="footnote"><Text weight="bold" tabular>{usd(sum(all))}</Text><Text dimColor> spent</Text></Text>
        {byFam.map(([f, n]) => <Text key={`t-${f}`} size="footnote" color={FAM[f].ink}>{`● ${f} ${usd(n)}`}</Text>)}
      </Box>
    )
  }
  const byStart = (list: Agent[]) => list.filter(a => a.status === 'running').sort((a, b) => a.startedAt - b.startedAt)
  const byEnd = (list: Agent[]) => list.filter(a => a.status !== 'running').sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
  return { art, took, dotOf, sum, head, liveRow, pastRow, totals, byStart, byEnd }
}

export const register: Register = on => {
  // The band holds half the window at most, so one of the two expands at a time: meter's Show folds crew.
  on('ui.press', { plugin: 'meter', element: 'toggle' }, async ($, e, next) => {
    await update($, isOpen, () => false)
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'crew', description: 'Show the agents band with this session\'s agent history' })
    $.clock.every(1000, async () => {
      if (!(await read($, agents)).some(a => a.status === 'running')) return
      const now = await $.clock.now()
      await update($, tick, () => now)
    })
    return next(e)
  })

  on('command.run', { command: 'crew' }, async $ => {
    await update($, seen, s => ({ ...s, isPinned: true }))
    await update($, isOpen, () => true)
    return { text: 'Agents band shown above the prompt.' }
  })

  // A new message from the person retires the finished agents from the band; running ones stay.
  on('prompt.submit', async ($, e, next) => {
    // Slash commands (/reload-plugins) and messages the person never typed don't count as their next message.
    if (e.command || e.isMeta) return next(e)
    const now = await $.clock.now()
    await update($, seen, s => ({ ...s, promptAt: now, isPinned: false }))
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined || !started.agentId) return started
    const id = started.agentId
    // A new batch (nothing else running) starts folded, whatever the last one was left at.
    if (!(await read($, agents)).some(x => x.status === 'running')) await update($, isOpen, () => false)
    const a: Agent = {
      ...blank(id, await $.clock.now()),
      task: short(e.description || e.subagentType || 'agent', 60),
      type: e.name ?? e.subagentType ?? '',
      model: started.model,
      asked: short(e.prompt.split('\n').find(l => l.trim()) ?? '', 140),
    }
    await update($, agents, list => [...list.filter(x => x.id !== id), a].slice(-200))
    return started
  })

  on('turn.start', async ($, e, next) => {
    // A message can wake a finished agent under the same id.
    if (e.agentId && (await known($, e.agentId))) await edit($, e.agentId, a => (a.status === 'running' ? a : { ...a, status: 'running', endedAt: null }))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const id = e.agentId
    if (!id || !(await known($, id))) return r
    const u: Usage = r.usage ?? {}
    await edit($, id, a => ({
      ...a,
      model: e.model || a.model,
      effort: e.effort === undefined ? a.effort : String(e.effort),
      costUsd: a.costUsd + stepCost(e.model || a.model, u),
      tokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) || a.tokens,
      said: r.answer.trim() ? short(r.answer, 160) : a.said,
    }))
    return r
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (!id || !(await known($, id))) return next(e)
    const what = describe(String(e.tool), e as unknown as Record<string, unknown>)
    const at = await $.clock.now()
    await edit($, id, a => ({ ...a, tool: what, toolAt: at }))
    try {
      return await next(e)
    } finally {
      await edit($, id, a => ({ ...a, calls: a.calls + 1, tool: a.tool === what ? null : a.tool, toolAt: a.tool === what ? null : a.toolAt, recent: [...a.recent, what].slice(-3) }))
    }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const id = e.agentId
    if (id && (await known($, id))) {
      const now = await $.clock.now()
      const status: AgentStatus = e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'stopped' : 'failed'
      await edit($, id, a => ({ ...a, status, endedAt: now, tool: null, toolAt: null, said: e.answer.trim() ? short(e.answer, 160) : a.said }))
    }
    return done
  })

  // Every agent of the session, in a pane that scrolls however long the list runs.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [all, , now] = await Promise.all([read($, agents), read($, tick), $.clock.now()])
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    const d = kit({ Box, Text, Button: els.Button, Svg: e.surface !== 'terminal' && 'Svg' in els ? els.Svg : null }, now, e.props.bodyColumns ?? 200)
    const live = d.byStart(all)
    const past = d.byEnd(all)
    return (
      <Box key="crew-pane" flexDirection="column">
        {all.length === 0 && <Text dimColor>No agents yet this session.</Text>}
        {live.length > 0 && <Box key="run-head">{d.head(`RUNNING · ${live.length}`)}</Box>}
        {live.map(d.liveRow)}
        {past.length > 0 && <Box key="past-head" marginTop={live.length ? 1 : 0}>{d.head(`THIS SESSION · ${past.length}`)}</Box>}
        {past.map(d.pastRow)}
        {all.length > 0 && d.totals(all)}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const [all, open, s, , now] = await Promise.all([read($, agents), read($, isOpen), read($, seen), read($, tick), $.clock.now()])
    // The band holds the agents of this exchange: running ones, and ones that finished since the person's
    // last message. Dismissing hides those until a new one starts; /crew pins it open with the history.
    const batch = all.filter(a => (a.status === 'running' || (a.endedAt ?? 0) > s.promptAt || a.startedAt > s.promptAt) && a.startedAt > s.dismissedAt)
    if (!s.isPinned && batch.length === 0) return next(e)

    // What the mods beneath drew (meter's USAGE). Crew fits itself into the rows the band has left after
    // them and the divider: the band holds at most half the window, and a taller tree scrolls USAGE away.
    const below = await next(e)
    const hasBelow = !isEmpty(below)
    // With meter above crew in the chain instead, its rows are out of sight here: keep USAGE's and the divider's.
    const room = (e.props.maxRows ?? 24) - (hasBelow ? rowsOf(below) + 1 : 2)

    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // The terminal's table answers Svg with an empty box, so ask the surface, not the table.
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : null
    const d = kit({ Box, Text, Button, Svg }, now, e.props.bodyColumns ?? 200)
    const { art, took, dotOf, sum } = d
    const running = d.byStart(all)
    // Opening an open pane only retitles it, which looks like nothing happened: say where it is instead.
    const openHistory = async () => {
      if ((await $.ui.panes()).some(p => p.id === PANE && p.isShown)) $.ui.toast('The Agents pane is open beside the chat.')
      else await $.ui.open({ id: PANE, title: 'Agents' })
    }

    // The surface's own button, as meter's, so it follows the theme; × turns red under the pointer.
    const controls = (cost: number) => (
      <Box key="right" alignItems="center" gap={1} flexShrink={0}>
        <Text weight="bold" tabular>{usd(cost)}</Text>
        <Button key="toggle" label={open ? 'Hide' : 'Show'} onPress={() => update($, isOpen, o => !o)} />
        <Box key="dismiss-box" paddingX={1}>
          <Button key="dismiss" label="×" plain dimColor hover={{ color: RED.ink, dimColor: false }} onPress={async () => {
            const at = await $.clock.now()
            await update($, seen, x => ({ ...x, dismissedAt: at, isPinned: false }))
            await update($, isOpen, () => false)
          }} />
        </Box>
      </Box>
    )

    // Collapsed: up to four running agents by name; past that a count per model, so it stays one line.
    const ran = batch.filter(a => a.status === 'running')
    const longest = [...(ran.length ? ran : batch)].sort((a, b) => took(b) - took(a))[0]
    const summary = ran.length === 0
      ? batch.length === 0
        ? [<Text key="none" dimColor>no agents yet this session</Text>]
        : [
            art('done-pill', statusPill('done'), 'DONE', STATUS.done[1]),
            <Text key="finished"><Text weight="bold">{batch.filter(a => a.status === 'done').length}</Text><Text dimColor> finished</Text></Text>,
            ...(batch.some(a => a.status !== 'done') ? [<Text key="failed"><Text weight="bold" color={RED.ink}>{batch.filter(a => a.status !== 'done').length}</Text><Text dimColor> failed or stopped</Text></Text>] : []),
            ...(longest ? [<Text key="longest"><Text dimColor>longest </Text><Text weight="bold" tabular>{dur(took(longest))}</Text></Text>] : []),
          ]
      : ran.length <= 4
        ? ran.map(a => (
            <Box key={`c-${a.id}`} gap={1} alignItems="center" flexShrink={0}>
              {dotOf(a, `cd-${a.id}`)}
              <Text>{short(a.task, 22)}</Text>
              <Text weight="bold" tabular color={FAM[famOf(a.model)].ink}>{dur(took(a))}</Text>
            </Box>
          ))
        : [
            <Text key="count" weight="bold">{ran.length} running</Text>,
            ...(['opus', 'sonnet', 'haiku', 'other'] as Fam[]).flatMap(f => {
              const n = ran.filter(a => famOf(a.model) === f).length
              return n ? [<Box key={`f-${f}`} gap={1} alignItems="center" flexShrink={0}>{art(`fd-${f}`, dot(FAM[f].hue), '●', FAM[f].ink)}<Text weight="bold" color={FAM[f].ink}>{n}</Text></Box>] : []
            }),
            ...(longest ? [<Text key="longest"><Text dimColor>longest </Text>{short(longest.task, 22)} <Text weight="bold" tabular color={FAM[famOf(longest.model)].ink}>{dur(took(longest))}</Text></Text>] : []),
          ]

    const top = (
      <Box key="crew-top" gap={2} alignItems="center">
        <Box key="crew-left" columnGap={2} rowGap={1} alignItems="center" flexWrap={open ? 'wrap' : 'nowrap'} overflow="hidden" minWidth={0} flexGrow={1} flexShrink={1}>
          <Text key="title" bold>AGENTS</Text>
          {open && running.length > 0 && art('live', statusPill('running'), `${running.length} LIVE`, STATUS.running[1])}
          {open ? <Text dimColor>{running.length ? `${running.length} running · ` : ''}{all.length - running.length} done this session</Text> : summary}
        </Box>
        {controls(open ? sum(all) : sum(batch))}
      </Box>
    )

    let mine = top
    if (open) {
      const past = d.byEnd(all)
      // Running agents are what the expanded view is for, so they take the room first (the header already says
      // how many). History gets what is left, a heading and a few rows, else one link to the pane, which also
      // holds the totals. Past the room, the newest running ones are in the pane too.
      const liveCap = room - 1 - (past.length ? 1 : 0)
      const liveShown = running.length <= liveCap ? running : running.slice(0, Math.max(1, liveCap - 1))
      const liveHidden = running.length - liveShown.length
      const left = liveCap - liveShown.length - (liveHidden ? 1 : 0)
      const pastShown = left >= 2 ? past.slice(0, Math.min(4, left - 1)) : []
      const pastHidden = past.length - pastShown.length
      const link = (key: string, label: string) => (
        <Box key={`${key}-box`} paddingX={1}>
          <Button key={key} plain label={label} onPress={openHistory} />
        </Box>
      )
      mine = (
        <Box key="crew" flexDirection="column">
          {top}
          {liveShown.map(d.liveRow)}
          {liveHidden > 0 && link('more-live', `+ ${liveHidden} more running ›`)}
          {pastShown.length > 0 && <Box key="past-head">{d.head('THIS SESSION')}</Box>}
          {pastShown.map(d.pastRow)}
          {past.length > 0 && link('history', !pastShown.length ? `${past.length} done · full history ›` : pastHidden ? `+ ${pastHidden} earlier · full history ›` : 'Full history ›')}
        </Box>
      )
    }

    if (!hasBelow) return mine
    // One band: crew's rows, a hairline, then meter's. Only drawn while crew shows, so USAGE alone has none.
    const divider = Svg
      ? <Box key="crew-rule" width="100%" overflow="hidden"><Svg source={RULE} width={4000} height={13} alt="divider" /></Box>
      : <Box key="crew-rule"><Text dimColor wrap="truncate">{'─'.repeat(Math.max(1, e.props.bodyColumns ?? 80))}</Text></Box>
    return <Box key="crew-stack" flexDirection="column">{mine}{divider}{below}</Box>
  })
}
