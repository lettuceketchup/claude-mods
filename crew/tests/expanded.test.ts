import { expect, test } from 'claude-code/testing'

test('expanded: every running agent gets a row before history does', async ($, on) => {
  let n = 0
  on('clock.now', () => ({ value: Date.now() }) as never)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: `a${++n}` }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('ui.render', () => ({ type: 'Box', props: { key: 'meter-top' }, children: [{ type: 'Text', props: {}, children: ['USAGE'] }] }) as never)
  for (let i = 1; i <= 18; i++) {
    await $.agent.spawn({ prompt: 'Go.', description: `Done ${i}` } as never)
    await $.turn.complete({ agentId: `a${i}`, reason: 'answer', answer: 'ok' } as never)
  }
  for (let i = 0; i < 3; i++) await $.agent.spawn({ prompt: 'Go.', description: `Live ${i}` } as never)

  // About what desktop gives the band: 12 rows, two of them USAGE and the divider.
  const ui = await $.ui.mount({ plugin: 'crew', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns: 120 } } as never)
  await ui.press({ key: 'toggle' } as never)
  for (const id of ['a19', 'a20', 'a21']) expect(await ui.find({ key: `r-${id}` })).toBeDefined()
  expect(await ui.find({ key: 'more-live' })).toBeUndefined()
  expect(await ui.find({ key: 'history' })).toBeDefined()
  expect(await ui.find({ key: 'totals' })).toBeUndefined()
  expect(await ui.find({ text: 'USAGE' })).toBeDefined()
  await ui.unmount()
})
