import { expect, test } from 'claude-code/testing'

test('shows a spawned agent, its tool and model, and hides on dismiss', async ($, on) => {
  on('clock.now', () => ({ value: Date.now() }) as never)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }) as never)
  on('tool.call', () => ({ result: 'ok' }) as never)
  // Stands for what the mods beneath draw (meter) and the engine's empty band.
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  await $.agent.spawn({ prompt: 'Review the auth diff.', description: 'Review auth changes', subagentType: 'code-reviewer' } as never)
  await $.tool.call({ tool: 'Grep', pattern: 'token', agentId: 'a1' } as never)

  const props = { hasSurvey: false, isWorking: true }
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'crew', surface, component: 'AbovePrompt', props } as never)
    expect(await ui.find({ key: 'crew-top', text: /AGENTS.*Review auth changes/ })).toBeDefined()
    await ui.press({ key: 'toggle' } as never)
    expect(await ui.find({ key: 'r-a1' })).toBeDefined()
    expect(await ui.find({ key: 'tool', text: /Grep.*token/ })).toBeDefined()
    if (surface === 'terminal') expect(await ui.find({ type: 'Text', text: 'OPUS' })).toBeDefined()
    await ui.press({ key: 'toggle' } as never)
    await ui.unmount()
  }

  const ui = await $.ui.mount({ plugin: 'crew', surface: 'terminal', component: 'AbovePrompt', props } as never)
  await ui.press({ key: 'dismiss' } as never)
  expect(await ui.find({ key: 'crew-top' })).toBeUndefined()
  await ui.unmount()
})
