import { atom, read, update } from 'claude-code'
import type { Register, SessionMeasureInput } from 'claude-code'

import type { Limit, Vitals } from '../types'

const empty: Vitals = {
  pct: null, tokens: null, window: 0, costUsd: null, limits: [], compactions: 0,
  lastReplyAt: null, costAtTurnStart: null, turnCosts: [], ttlMin: null,
}
const vitals = atom({ plugin: 'meter', key: 'vitals' } as const, empty)
const isOpen = atom({ plugin: 'meter', key: 'isOpen' } as const, false)
// Bumped every 30s so the idle and cache timers move between turns.
const tick = atom({ plugin: 'meter', key: 'now' } as const, 0)

const MIN = 60_000
const k = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}`)
const usd = (n: number) => (n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`)
const span = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / MIN))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`
}
const clamp = (pct: number) => Math.max(0, Math.min(100, pct))
// A picture can't read the theme, but the app's colour scheme reaches it: each pill carries its dark colours as
// class rules, which win over the fill attributes holding the light ones.
const mix = (a: string, b: string, t: number) =>
  '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('')
const SHADE = '#262624'
const darkCss = (rules: Record<string, string>) =>
  `<style>@media (prefers-color-scheme: dark){${Object.entries(rules).map(([c, v]) => `.${c}{fill:${v}}`).join('')}}</style>`
// Desktop lays the band out in pixels; this is about one terminal cell there, for sizing drawings in cells.
const CELL = 7
const label = (kind: string) => (/five/i.test(kind) ? '5H' : /seven/i.test(kind) ? '7D' : /spend/i.test(kind) ? 'SPEND' : kind.replace(/[_-]+/g, ' ').toUpperCase())
// Weekly first, then 5-hour, as in the reference band.
const isFast = (l: Limit) => /five/i.test(l.kind)
const order = (l: Limit) => (/seven/i.test(l.kind) ? 0 : isFast(l) ? 1 : 2)

// SVGs are drawn as images and can't follow the theme. Pastels for dots and fills, a deeper ink of the
// same hue for text so it keeps its contrast, and a pale tint behind the cache tag's letters.
const HUE = { green: '#8fbc94', yellow: '#e6c062', red: '#e3958a', blue: '#8ab6dc' } as const
const INK = { green: '#4d7a55', yellow: '#8f6b12', red: '#a8493d', blue: '#3c6e99' } as const
const TINT = { green: '#d5e8d7', yellow: '#f5e6bd', red: '#f6d6d1', blue: '#d5e6f4' } as const
type Hue = keyof typeof HUE
const TRACK = 'fill="#888" fill-opacity="0.3"'
// The 5-hour window runs out fast, so it warns earlier than the weekly one.
const leftHue = (left: number, isFast: boolean): Hue =>
  left >= (isFast ? 60 : 50) ? 'green' : left >= (isFast ? 30 : 20) ? 'yellow' : 'red'
const usedHue = (used: number): Hue => (used < 50 ? 'green' : used < 75 ? 'yellow' : 'red')
type Art = { source: string; width: number; height: number; title: string }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// The size goes on the element too: without it the surface stretches the image to the slot.
// `tip` becomes the SVG's <title>, the hover tooltip (shown when the Svg is drawn interactive).
const svg = (width: number, height: number, body: string, tip = ''): Art => ({
  source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${tip ? `<title>${esc(tip)}</title>` : ''}<rect width="${width}" height="${height}" fill="transparent"/>${body}</svg>`,
  width,
  height,
  title: tip,
})
const clock = (at: number, withDay: boolean) =>
  new Date(at).toLocaleString(undefined, withDay ? { weekday: 'short', hour: 'numeric', minute: '2-digit' } : { hour: 'numeric', minute: '2-digit' })

/** A row of `n` dots, the first `pct` of them lit. */
const dotRow = (pct: number, hue: Hue, n: number, tip: string) => {
  const lit = Math.round((clamp(pct) / 100) * n)
  return svg(n * 6.5, 8, Array.from({ length: n }, (_, i) =>
    i < lit ? `<circle cx="${i * 6.5 + 3.25}" cy="4" r="2.7" fill="${HUE[hue]}"/>` : `<circle cx="${i * 6.5 + 3.25}" cy="4" r="1.3" ${TRACK}/>`).join(''), tip)
}

/** Two rows of small dots filled column by column: the context window. */
const dotGrid = (pct: number, hue: Hue, tip: string, cols = 36) => {
  const lit = Math.round((clamp(pct) / 100) * cols * 2)
  return svg(cols * 7, 14, Array.from({ length: cols * 2 }, (_, i) => {
    const [c, r] = [Math.floor(i / 2), i % 2]
    return `<circle cx="${c * 7 + 3}" cy="${r * 7 + 3.5}" r="2.2" ${i < lit ? `fill="${HUE[hue]}"` : TRACK}/>`
  }).join(''), tip)
}

/** The idle slider: a solid line up to now, dots to the cache's expiry, a ring at the expiry. */
const slider = (pct: number, hue: Hue, tip: string, w = 220) => {
  const end = w - 8
  const x = Math.max(4, (clamp(pct) / 100) * end)
  const dots = []
  for (let d = x + 8; d < end - 6; d += 9) dots.push(`<circle cx="${d}" cy="7" r="1.6" ${TRACK}/>`)
  return svg(w, 14, `<line x1="4" y1="7" x2="${x}" y2="7" stroke="${HUE[hue]}" stroke-width="4" stroke-linecap="round"/>${dots.join('')}<circle cx="${end}" cy="7" r="4.5" fill="none" stroke="${INK.blue}" stroke-width="2"/>`, tip)
}

/** A solid rounded tag: pale fill, deep letters of the same hue, no outline. */
const pill = (text: string, hue: Hue, tip: string) => {
  const w = 14 + text.length * 8.4
  return svg(w, 20, `${darkCss({ t: mix(HUE[hue], SHADE, 0.7), i: mix(HUE[hue], '#ffffff', 0.35) })}<rect class="t" x="0" y="0" width="${w}" height="20" rx="5" fill="${TINT[hue]}"/><text class="i" x="${w / 2}" y="14" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="11" font-weight="700" letter-spacing="1.4" fill="${INK[hue]}">${text}</text>`, tip)
}

/** One column of stacked dots per turn, its height the turn's share of the most expensive one. */
const turnStacks = (costs: number[], tip: string, rows = 6) => {
  const top = Math.max(...costs, 0.0001)
  return svg(costs.length * 10, rows * 7, costs.map((c, i) => {
    const lit = c > 0 ? Math.max(1, Math.round((c / top) * rows)) : 0
    const last = i === costs.length - 1
    return Array.from({ length: rows }, (_, r) =>
      `<circle cx="${i * 10 + 4}" cy="${(rows - 1 - r) * 7 + 3.5}" r="2.4" ${r < lit ? `fill="${HUE[last ? 'red' : 'green']}"` : TRACK}/>`).join('')
  }).join(''), tip)
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

export const register: Register = (on, options) => {
  // 0 is auto: 60 minutes on a subscription, 5 on the API.
  const setMin = Math.max(0, Number(options.cacheMinutes) || 0)
  let lastStepEnd: number | null = null
  // How much the top row has shed to fit on one line (see `need`); kept between draws so it doesn't flap.
  let shed = 0

  // The band holds half the window at most, so one of the two expands at a time: crew's Show folds meter.
  on('ui.press', { plugin: 'crew', element: 'toggle' }, async ($, e, next) => {
    await update($, isOpen, () => false)
    return next(e)
  })

  const measured = (m: Pick<SessionMeasureInput, 'context' | 'rateLimits' | 'cost'>) => (v: Vitals): Vitals => ({
    ...empty, ...v,
    pct: m.context.percent ?? null,
    tokens: m.context.tokens ?? null,
    window: m.context.window,
    costUsd: m.cost?.usd ?? null,
    limits: m.rateLimits.map(r => ({ kind: r.kind, pct: r.percentUsed, resetsAt: r.resetsAt ? Date.parse(r.resetsAt) || null : null })),
  })

  on('session.start', async ($, e, next) => {
    // session.measure only fires on a change, so a (re)load seeds from the current reading.
    const u = await $.session.usage().catch(() => null)
    if (u) await update($, vitals, measured(u))
    $.clock.every(30_000, async () => {
      const now = await $.clock.now()
      await update($, tick, () => now)
    })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, vitals, measured(e))
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // The previous turn's spend is final once the next one starts (cost lands after turn.complete).
    if (!e.agentId) {
      await update($, vitals, x => {
        const v = { ...empty, ...x }
        const prev = v.costUsd !== null && v.costAtTurnStart !== null ? [...v.turnCosts, v.costUsd - v.costAtTurnStart].slice(-12) : v.turnCosts
        return { ...v, turnCosts: prev, costAtTurnStart: v.costUsd }
      })
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId) return yield* next(e)
    const sentAt = await $.clock.now()
    const r = yield* next(e)
    const u = r.usage
    // ponytail: the API gives no TTL to mods; infer it from hits and misses after an idle gap. A model
    // switch also drops the cache and can read as a 5m miss; the cacheMinutes option is the fallback.
    if (u && lastStepEnd !== null) {
      const gap = sentAt - lastStepEnd
      const hit = u.cache_read_input_tokens > 1000
      const rewrote = !hit && u.cache_creation_input_tokens > 1000
      const learned = hit && gap > 5.5 * MIN ? 60 : rewrote && gap > 5.5 * MIN && gap < 55 * MIN ? 5 : null
      if (learned) await update($, vitals, v => ({ ...empty, ...v, ttlMin: learned }))
    }
    lastStepEnd = await $.clock.now()
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) {
      const now = await $.clock.now()
      await update($, vitals, v => ({ ...empty, ...v, lastReplyAt: now }))
    }
    return r
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    if (!e.agentId && e.trigger !== 'precompute') await update($, vitals, v => ({ ...empty, ...v, compactions: v.compactions + 1 }))
    return done
  })

  // Exact, when a subagent finishes: the Agent result splits its cache writes by lifetime.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const r = await next(e)
    type Split = { ephemeral_1h_input_tokens: number; ephemeral_5m_input_tokens: number }
    const c = r.result && !r.isError ? (r.result as { usage?: { cache_creation?: Split | null } }).usage?.cache_creation : null
    if (c && c.ephemeral_1h_input_tokens + c.ephemeral_5m_input_tokens > 0) {
      const learned = c.ephemeral_1h_input_tokens >= c.ephemeral_5m_input_tokens ? 60 : 5
      await update($, vitals, v => ({ ...empty, ...v, ttlMin: learned }))
    }
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const [v0, open, , now] = await Promise.all([read($, vitals), read($, isOpen), read($, tick), $.clock.now()])
    const v = { ...empty, ...v0 }
    // The API reports no 5h/7d windows: a reply that came back without any means an API session.
    const isApi = v.limits.length === 0 && v.lastReplyAt !== null
    const fallbackMin = setMin || (isApi ? 5 : 60)
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // The terminal's table answers Svg with an empty box, so ask the surface, not the table.
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : null
    const working = e.props.isWorking

    // A drawing where the surface has Svg; the terminal gets the same reading as dots.
    const art = (key: string, a: Art, text: () => string, hue: Hue) =>
      Svg ? <Svg key={key} source={a.source} width={a.width} height={a.height} alt={a.title} isInteractive /> : <Text key={key} color={INK[hue]}>{text()}</Text>
    const dots = (pct: number, n: number) => {
      const lit = Math.round((clamp(pct) / 100) * n)
      return '●'.repeat(lit) + '·'.repeat(n - lit)
    }

    const ttl = (v.ttlMin ?? fallbackMin) * MIN
    const idle = v.lastReplyAt === null ? null : now - v.lastReplyAt
    const coldIn = idle === null ? null : ttl - idle
    const ttlNote = v.ttlMin === null
      ? `Lifetime assumed ${fallbackMin} min (${setMin ? 'the "Cache lifetime" setting' : isApi ? 'the API default' : 'the subscription default'}).`
      : `Lifetime ${v.ttlMin} min, observed this session.`
    const cache: { tag: string; hue: Hue; note: string; tip: string } | null = working
      ? { tag: 'LIVE', hue: 'blue', note: '', tip: 'Claude is replying; this reply refreshes the prompt cache.' }
      : coldIn === null
        ? null
        : coldIn > 0
          ? { tag: 'WARM', hue: coldIn < 5 * MIN ? 'yellow' : 'green', note: span(coldIn), tip: `Prompt cache warm until about ${clock(now + coldIn, false)}. ${ttlNote} After that, your next message re-sends the whole context at full price.` }
          : { tag: 'COLD', hue: 'red', note: 're-caches', tip: `Prompt cache likely expired ${span(-coldIn)} ago. ${ttlNote} Your next message re-sends the whole context at full price.` }

    // One line at any width. Pieces drop in this order until the row fits: 1 the dot bars, 2 the USAGE
    // label, 3 the reset times, 4 the cache pill (as plain text), 5 the weekly and other slow limits,
    // 6 CTX; past that the row is clipped at the right. Hovers and the expanded view keep everything.
    const sorted = [...v.limits].sort((a, b) => order(a) - order(b))
    const resetOf = (l: Limit) => (l.resetsAt !== null && l.resetsAt > now ? span(l.resetsAt - now) : '')
    const pct = (n: number) => `${Math.round(n)}%`
    const ctx = v.pct
    const bar = Svg ? Math.ceil((8 * 6.5) / CELL) : 8
    const pillCells = (tag: string) => (Svg ? Math.ceil((14 + tag.length * 8.4) / CELL) : tag.length + 2)
    const need = (level: number) => {
      const groups = [
        ...(level < 2 ? [5] : []),
        ...sorted.filter(l => isFast(l) || level < 5).map(l => label(l.kind).length + 1 + (level < 1 ? bar + 1 : 0) + pct(100 - l.pct).length + (level < 3 && resetOf(l) ? resetOf(l).length + 3 : 0)),
        ...(ctx !== null && level < 6 ? [3 + 1 + (level < 1 ? bar + 1 : 0) + pct(ctx).length] : []),
        ...(cache ? [(level < 4 ? pillCells(cache.tag) : cache.tag.length) + (cache.note ? cache.note.length + 1 : 0)] : []),
      ]
      return groups.reduce((a, b) => a + b, 0) + 2 * Math.max(0, groups.length - 1)
    }
    // Cost, the toggle and the gap before them stay on the right whatever the width.
    const room = (e.props.bodyColumns ?? 200) - ((v.costUsd !== null ? usd(v.costUsd).length + 1 : 0) + 8 + 2)
    // Coming back needs two cells to spare, so a timer growing by a digit can't toggle a piece every tick.
    let level = 0
    while (level < 6 && need(level) > room - (level < shed ? 2 : 0)) level++
    shed = level

    const limits = sorted.filter(l => isFast(l) || level < 5).map(l => {
      const left = clamp(100 - l.pct)
      const fast = isFast(l)
      const hue = leftHue(left, fast)
      const resets = l.resetsAt !== null && l.resetsAt > now ? ` Resets ${clock(l.resetsAt, !fast)} (in ${span(l.resetsAt - now)}).` : ''
      const tip = `${fast ? '5-hour' : order(l) === 0 ? 'Weekly' : label(l.kind)} limit: ${Math.round(l.pct)}% used, ${Math.round(left)}% left.${resets}`
      return (
        <Box key={l.kind} gap={1} alignItems="center" flexShrink={0}>
          <Text>{label(l.kind)}</Text>
          {level < 1 && art(`${l.kind}-dots`, dotRow(left, hue, 8, tip), () => dots(left, 8), hue)}
          <Text color={INK[hue]} bold>{pct(left)}</Text>
          {level < 3 && resetOf(l) && <Text dimColor>· {resetOf(l)}</Text>}
        </Box>
      )
    })

    const ctxHue = usedHue(ctx ?? 0)
    const ctxTip = v.tokens !== null && v.window
      ? `Context: ${v.tokens.toLocaleString()} of ${v.window.toLocaleString()} tokens (${Math.round(ctx ?? 0)}%).${v.compactions ? ` Compacted ${v.compactions}× this session.` : ''}`
      : 'Context: no reading yet.'
    const turnUsd = v.costUsd !== null && v.costAtTurnStart !== null ? v.costUsd - v.costAtTurnStart : null

    const top = (
      <Box key="top" gap={2} alignItems="center">
        {/* Never wraps: what doesn't fit was shed above, and a band narrower still clips here. */}
        <Box key="left" columnGap={2} alignItems="center" flexWrap="nowrap" overflow="hidden" minWidth={0} flexGrow={1} flexShrink={1}>
        {level < 2 && <Text key="usage" bold>USAGE</Text>}
        {limits.length ? limits : !isApi && <Text dimColor>limits show after the first reply</Text>}
        {ctx !== null && level < 6 && (
          <Box key="ctx" gap={1} alignItems="center" flexShrink={0}>
            <Text>CTX</Text>
            {level < 1 && art('ctx-dots', dotRow(ctx, ctxHue, 8, ctxTip), () => dots(ctx, 8), ctxHue)}
            <Text color={INK[ctxHue]} bold>{Math.round(ctx)}%</Text>
          </Box>
        )}
        {cache && (
          <Box key="cache" gap={1} alignItems="center" flexShrink={0}>
            {level < 4
              ? art('pill', pill(cache.tag, cache.hue, cache.tip), () => ` ${cache.tag} `, cache.hue)
              : <Text color={INK[cache.hue]} bold>{cache.tag.toLowerCase()}</Text>}
            {cache.note && <Text color={INK[cache.hue]} bold>{cache.note}</Text>}
          </Box>
        )}
        </Box>
        <Box key="right" alignItems="center" gap={1} flexShrink={0}>
          {v.costUsd !== null && <Text bold>{usd(v.costUsd)}</Text>}
          <Button key="toggle" label={open ? 'Hide' : 'Show'} onPress={() => update($, isOpen, o => !o)} />
        </Box>
      </Box>
    )
    // One band above the prompt: meter sits nearest the prompt, below what other mods drew (crew).
    const stack = async (mine: typeof top) => {
      const below = await next(e)
      // An empty band beneath adds nothing; stacking it would still add the gap row.
      if (isEmpty(below)) return mine
      // A hairline between the bands above (crew's) and USAGE: wider than any band, cut to its width by the Box
      // around it (a picture given no width is drawn at its default 300px, not the band's).
      const divider = Svg
        ? <Box key="meter-rule" width="100%" overflow="hidden"><Svg source='<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="13" viewBox="0 0 4000 13" preserveAspectRatio="none"><rect y="6" width="4000" height="1" fill="#cfcfcb"/></svg>' width={4000} height={13} alt="divider" /></Box>
        : <Box key="meter-rule"><Text dimColor wrap="truncate">{'─'.repeat(Math.max(1, e.props.bodyColumns))}</Text></Box>
      return <Box key="meter-stack" flexDirection="column">{below}{divider}{mine}</Box>
    }
    if (!open) return stack(top)

    const head = (t: string) => <Text size="caption" weight="bold" dimColor>{t}</Text>
    const idlePct = idle === null ? 0 : (idle / ttl) * 100
    const idleHue: Hue = 'red'
    const stacks = turnUsd === null ? v.turnCosts : [...v.turnCosts, turnUsd]

    return stack(
      <Box key="band" flexDirection="column">
        {top}
        <Box key="detail" marginTop={1}>
          <Box key="idle" flexDirection="column" width="33%" paddingRight={2} gap={1}>
            {head('IDLE')}
            <Text size="title" weight="bold">{working ? 'now' : idle === null ? '—' : span(idle)}</Text>
            {art('idle-slider', slider(idlePct, idleHue, cache?.tip ?? 'No reply yet.'), () => dots(idlePct, 20), idleHue)}
            <Box key="idle-foot" justifyContent="space-between">
              <Text dimColor>last reply</Text>
              <Text color={INK.blue}>{coldIn === null ? '' : coldIn > 0 ? `cold in ${span(coldIn)}` : 'cold'}</Text>
            </Box>
          </Box>
          <Box key="ctx-col" flexDirection="column" width="34%" paddingX={2} gap={1}>
            {head('IN CONTEXT')}
            <Text><Text size="title" weight="bold">{v.tokens === null ? '—' : k(v.tokens)}</Text><Text dimColor> tokens</Text></Text>
            {art('ctx-grid', dotGrid(ctx ?? 0, ctxHue, ctxTip), () => dots(ctx ?? 0, 20), ctxHue)}
            <Text dimColor>
              {v.window ? `${Math.round(ctx ?? 0)}% of the ${k(v.window)} context` : 'no reading yet'}
              {v.compactions ? ` · compacted ${v.compactions}×` : ''}
            </Text>
          </Box>
          <Box key="spend" flexDirection="column" width="33%" paddingLeft={2} gap={1}>
            {head('SPEND')}
            <Text><Text size="title" weight="bold">{v.costUsd === null ? '—' : usd(v.costUsd)}</Text><Text dimColor> session</Text></Text>
            {stacks.length > 0 && art('turn-stacks', turnStacks(stacks, `Cost of the last ${stacks.length} turns, oldest first: ${stacks.map(usd).join(', ')}`), () => stacks.map(usd).join(' '), 'green')}
            <Text dimColor>{turnUsd === null ? ' ' : `+${usd(turnUsd)} ${working ? 'this turn' : 'last turn'}`}</Text>
          </Box>
        </Box>
      </Box>
    )
  })
}
