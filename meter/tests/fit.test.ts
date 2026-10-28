import { expect, test } from 'claude-code/testing'

test('the top row sheds pieces in order to stay one line', async ($, on) => {
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('clock.now', () => ({ value: Date.now() }) as never)
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  const at = (ms: number) => new Date(Date.now() + ms).toISOString()
  await $.session.measure({
    context: { window: 1_000_000, tokens: 220_000, percent: 22 },
    rateLimits: [
      { kind: 'seven_day', percentUsed: 12, resetsAt: at(3 * 86_400_000 + 6 * 3_600_000 + 30_000) },
      { kind: 'five_hour', percentUsed: 53, resetsAt: at(1 * 3_600_000 + 29 * 60_000 + 30_000) },
    ],
    cost: { usd: 21.17 },
    changed: ['context', 'rateLimits', 'cost'],
  } as never)

  const draw = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ plugin: 'meter', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, bodyColumns } } as never)
    const row = await ui.find({ key: 'top' })
    await ui.unmount()
    return row?.text ?? ''
  }

  // Wide: everything, bars and reset times included.
  const wide = await draw(140)
  expect(wide).toContain('USAGE')
  expect(wide).toContain('●●●●●●●')
  expect(wide).toContain('3d 6h')

  // A bit narrower: the bars go first, the label and reset times stay.
  const mid = await draw(75)
  expect(mid).not.toContain('●●●')
  expect(mid).toContain('USAGE')
  expect(mid).toContain('3d 6h')

  // Narrow: the label and reset times are gone, 5H and the cache stay.
  const narrow = await draw(50)
  expect(narrow).not.toContain('USAGE')
  expect(narrow).not.toContain('3d 6h')
  expect(narrow).toContain('5H')
  expect(narrow).toContain('$21.17')

  // Very narrow: the weekly limit and CTX are gone too.
  const tight = await draw(30)
  expect(tight).not.toContain('7D')
  expect(tight).not.toContain('CTX')
  expect(tight).toContain('5H')

  // Wide again: everything comes back.
  expect(await draw(140)).toContain('USAGE')
})
