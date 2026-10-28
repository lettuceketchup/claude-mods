import { expect, test } from 'claude-code/testing'

test('a divider between the band above and USAGE, none when alone', async ($, on) => {
  on('clock.now', () => ({ value: Date.now() }) as never)
  on('ui.render', () => ({ type: 'Box', props: { key: 'crew-top' }, children: [{ type: 'Text', props: {}, children: ['AGENTS'] }] }) as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'meter', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 80 } } as never)
    expect(await ui.find({ text: 'AGENTS' })).toBeDefined()
    expect(await ui.find({ key: 'meter-rule' })).toBeDefined()
    await ui.unmount()
  }
})
