import { expect, test } from 'claude-code/testing'

test('draws SVG meters on desktop, text dots in the terminal, context always shown', async ($, on) => {
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('clock.now', () => ({ value: Date.now() }) as never)
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  const at = (ms: number) => new Date(Date.now() + ms).toISOString()
  await $.session.measure({
    context: { window: 1_000_000, tokens: 164_000, percent: 16 },
    rateLimits: [
      { kind: 'seven_day', percentUsed: 6, resetsAt: at(3 * 86_400_000 + 9 * 3_600_000 + 30_000) },
      { kind: 'five_hour', percentUsed: 6, resetsAt: at(4 * 3_600_000 + 43 * 60_000 + 30_000) },
    ],
    cost: { usd: 2.42 },
    changed: ['context', 'rateLimits', 'cost'],
  } as never)

  const props = { hasSurvey: false, isWorking: false }
  const gui = await $.ui.mount({ plugin: 'meter', surface: 'desktop', component: 'AbovePrompt', props } as never)
  const first = (await gui.find({ type: 'Svg' })) as { props?: { source?: string } } | undefined
  expect(first?.props?.source).toContain('<title>Weekly limit: 6% used, 94% left. Resets')
  expect(await gui.find({ key: 'top', text: /CTX16%/ })).toBeDefined()
  expect(await gui.find({ type: 'Text', text: '$2.42' })).toBeDefined()
  await gui.press({ key: 'toggle' } as never)
  expect(await gui.find({ type: 'Text', text: 'IN CONTEXT' })).toBeDefined()
  await gui.unmount()

  const term = await $.ui.mount({ plugin: 'meter', surface: 'terminal', component: 'AbovePrompt', props } as never)
  expect(await term.find({ type: 'Svg' })).toBeUndefined()
  expect(await term.find({ type: 'Text', text: '●●●●●●●●' })).toBeDefined()
  await term.unmount()
})
