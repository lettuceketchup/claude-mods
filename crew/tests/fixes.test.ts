import { expect, test } from 'claude-code/testing'

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown }
const walk = (t: unknown, out: Node[] = []): Node[] => {
  if (Array.isArray(t)) t.forEach(c => walk(c, out))
  else if (t && typeof t === 'object') { out.push(t as Node); walk((t as Node).children, out) }
  return out
}

test('desktop: pictures have alt text, the running pill holds still, no light-only fills', async ($, on) => {
  let t = Date.now()
  on('clock.now', () => ({ value: t }) as never)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }) as never)
  on('tool.call', () => new Promise(() => {}) as never)
  on('ui.render', () => ({ type: 'Box', props: { key: 'meter-top' }, children: [{ type: 'Text', props: {}, children: ['USAGE'] }] }) as never)
  await $.agent.spawn({ prompt: 'Go.', description: 'Survey every hooks module' } as never)
  void $.tool.call({ tool: 'Bash', command: 'ping -n 15 127.0.0.1', agentId: 'a1' } as never)

  const props = { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 140 }
  // Expanded stays expanded across mounts, so Show is pressed once.
  const draw = async (isFirst = false) => {
    const ui = await $.ui.mount({ plugin: 'crew', surface: 'desktop', component: 'AbovePrompt', props } as never)
    if (isFirst) await ui.press({ key: 'toggle' } as never)
    const nodes = walk(await ui.drawn())
    await ui.unmount()
    return nodes
  }
  const first = await draw(true)
  t += 5000
  const later = await draw()

  const svgs = first.filter(n => n.type === 'Svg')
  expect(svgs.length).toBeGreaterThan(2)
  for (const s of svgs) expect(String(s.props?.alt ?? '')).not.toBe('')
  const pill = (nodes: Node[]) => nodes.find(n => n.type === 'Svg' && /HAIKU/.test(String(n.props?.source)))?.props?.source
  expect(pill(later)).toBe(pill(first))
  for (const n of first) expect(JSON.stringify(n.props ?? {})).not.toMatch(/#ffffff|#e2e2df/i)
})

test('narrow: the tool column goes first', async ($, on) => {
  on('clock.now', () => ({ value: Date.now() }) as never)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }) as never)
  on('tool.call', () => new Promise(() => {}) as never)
  on('ui.render', () => ({ type: 'engine', ref: 1 }) as never)
  await $.agent.spawn({ prompt: 'Go.', description: 'Survey every hooks module' } as never)
  void $.tool.call({ tool: 'Bash', command: 'ping -n 15 127.0.0.1', agentId: 'a1' } as never)
  for (const [cols, hasTool] of [[140, true], [70, false]] as const) {
    const ui = await $.ui.mount({ plugin: 'crew', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: cols } } as never)
    if (hasTool) await ui.press({ key: 'toggle' } as never)
    expect(Boolean(await ui.find({ text: /ping/ }))).toBe(hasTool)
    expect(await ui.find({ key: 'r-a1' })).toBeDefined()
    await ui.unmount()
  }
})

test('a new batch starts folded; pills carry dark colours; the divider is cut to the band', async ($, on) => {
  let n = 0
  on('clock.now', () => ({ value: Date.now() }) as never)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: `b${++n}` }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('ui.render', () => ({ type: 'Box', props: { key: 'meter-top' }, children: [{ type: 'Text', props: {}, children: ['USAGE'] }] }) as never)
  const props = { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 140 }
  await $.agent.spawn({ prompt: 'Go.', description: 'First' } as never)
  let ui = await $.ui.mount({ plugin: 'crew', surface: 'desktop', component: 'AbovePrompt', props } as never)
  await ui.press({ key: 'toggle' } as never)
  expect(await ui.find({ key: 'r-b1' })).toBeDefined()
  const nodes = walk(await ui.drawn())
  const pill = nodes.find(x => x.type === 'Svg' && /HAIKU/.test(String(x.props?.source)))
  expect(String(pill?.props?.source)).toContain('prefers-color-scheme: dark')
  const rule = nodes.find(x => x.type === 'Svg' && x.props?.alt === 'divider')
  expect(rule?.props?.width).toBe(4000)
  await ui.unmount()

  await $.turn.complete({ agentId: 'b1', reason: 'answer', answer: 'ok' } as never)
  await $.agent.spawn({ prompt: 'Go.', description: 'Second' } as never)
  ui = await $.ui.mount({ plugin: 'crew', surface: 'desktop', component: 'AbovePrompt', props } as never)
  expect(await ui.find({ key: 'r-b2' })).toBeUndefined()
  await ui.unmount()
})

test('history rows keep the effort in a pane-wide band', async ($, on) => {
  on('clock.now', () => ({ value: Date.now() }) as never)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'h1' }) as never)
  on('turn.step', async function* (_$: unknown, e: { turnId: string; index: number }) { return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], usage: {} } } as never)
  on('turn.complete', () => ({ text: '' }) as never)
  await $.agent.spawn({ prompt: 'Go.', description: 'Done one' } as never)
  // A streamed event: the step runs as its stream is read.
  const step = $.turn.step({ agentId: 'h1', turnId: 't1', index: 0, messageCount: 1, model: 'claude-haiku-5-5', effort: 'medium' } as never) as unknown
  if (step && typeof (step as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') for await (const _ of step as AsyncIterable<unknown>) void _
  else await step
  await $.turn.complete({ agentId: 'h1', reason: 'answer', answer: 'ok' } as never)
  const pane = await $.ui.mount({ plugin: 'crew', surface: 'desktop', component: 'Pane', requestId: 'crew-history', props: { bodyColumns: 60 } } as never)
  const pill = walk(await pane.drawn()).find(x => x.type === 'Svg' && /HAIKU/.test(String(x.props?.source)))
  expect(String(pill?.props?.source)).toContain('MED')
  await pane.unmount()
})

test('a sidebar-wide history pane sheds the effort and status pill instead of wrapping them', async ($, on) => {
  on('clock.now', () => ({ value: Date.now() }) as never)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 's1' }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  await $.agent.spawn({ prompt: 'Go.', description: 'Summarize crew mod hooks' } as never)
  await $.turn.complete({ agentId: 's1', reason: 'answer', answer: 'ok' } as never)
  for (const [cols, isWide] of [[48, false], [120, true]] as const) {
    const pane = await $.ui.mount({ plugin: 'crew', surface: 'terminal', component: 'Pane', requestId: 'crew-history', props: { bodyColumns: cols } } as never)
    expect(Boolean(await pane.find({ key: 'status' }))).toBe(isWide)
    expect(Boolean(await pane.find({ text: '✓' }))).toBe(!isWide)
    await pane.unmount()
  }
})
