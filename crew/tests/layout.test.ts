import { expect, test } from 'claude-code/testing'

const usage = { type: 'Box', props: { key: 'meter-top' }, children: [{ type: 'Text', props: {}, children: ['USAGE'] }] }

test('agents alone: no divider, and the band shows without meter', async ($, on) => {
  on('clock.now', () => ({ value: Date.now() }) as never)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }) as never)
  // The engine's own slot beneath, with no mod drawing there.
  on('ui.render', () => ({ type: 'engine', ref: 1 }) as never)
  await $.agent.spawn({ prompt: 'Scan.', description: 'Scan config' } as never)
  const ui = await $.ui.mount({ plugin: 'crew', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 80 } } as never)
  expect(await ui.find({ key: 'crew-top', text: /Scan config/ })).toBeDefined()
  expect(await ui.find({ key: 'crew-rule' })).toBeUndefined()
  await ui.unmount()
})

test('stacked on USAGE: a divider between, and a long list fits the room left', async ($, on) => {
  let n = 0
  on('clock.now', () => ({ value: Date.now() }) as never)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: `a${++n}` }) as never)
  on('ui.render', () => usage as never)
  for (let i = 0; i < 15; i++) await $.agent.spawn({ prompt: 'Go.', description: `Job ${i}` } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'crew', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns: 80 } } as never)
    expect(await ui.find({ key: 'crew-rule' })).toBeDefined()
    expect(await ui.find({ text: 'USAGE' })).toBeDefined()
    await ui.press({ key: 'toggle' } as never)
    // 12 rows less USAGE and the divider leaves 10: the top row, RUNNING, a few lines and the rest counted.
    expect(await ui.find({ key: 'more-live' })).toBeDefined()
    expect(await ui.find({ text: 'USAGE' })).toBeDefined()
    expect(await ui.find({ key: 'r-a1' })).toBeDefined()
    expect(await ui.find({ key: 'r-a15' })).toBeUndefined()
    await ui.press({ key: 'toggle' } as never)
    await ui.unmount()
  }

  // The history pane holds every one of them.
  const pane = await $.ui.mount({ plugin: 'crew', surface: 'desktop', component: 'Pane', requestId: 'crew-history', props: {} } as never)
  expect(await pane.find({ key: 'r-a15' })).toBeDefined()
  expect(await pane.find({ text: /RUNNING · 15/ })).toBeDefined()
  await pane.unmount()
})
