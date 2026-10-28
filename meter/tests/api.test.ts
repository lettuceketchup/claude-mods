import { expect, test } from 'claude-code/testing'

const setup = async ($: any, on: any, rateLimits: unknown[]) => {
  const clock = { t: Date.now() }
  on('session.measure', (_$: unknown, e: { changed: unknown }) => ({ changed: e.changed }))
  on('clock.now', () => ({ value: clock.t }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  await $.session.measure({ context: { window: 200_000, tokens: 30_000, percent: 15 }, rateLimits, cost: { usd: 0.4 }, changed: ['context', 'cost'] } as never)
  await $.turn.complete({ reason: 'answer', answer: 'ok' } as never)
  clock.t += 2 * 60_000
  return async () => {
    const ui = await $.ui.mount({ plugin: 'meter', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, bodyColumns: 120 } } as never)
    const row: string = (await ui.find({ key: 'top' }))?.text ?? ''
    await ui.unmount()
    return row
  }
}

test('API session: no limits placeholder after a reply, cache assumed 5 minutes', async ($, on) => {
  const row = await (await setup($, on, []))()
  expect(row).not.toContain('limits show')
  expect(row).toContain('WARM 3m')
})

test('subscription session: limits shown, cache assumed 60 minutes', async ($, on) => {
  const row = await (await setup($, on, [{ kind: 'five_hour', percentUsed: 10 }]))()
  expect(row).toContain('5H')
  expect(row).toContain('WARM 58m')
})

test('an Agent result with 1h cache writes overrides the API guess', async ($, on) => {
  on('tool.call', () => ({ result: { agentId: 'a1', content: [], totalToolUseCount: 0, totalDurationMs: 0, totalTokens: 0, usage: { cache_creation: { ephemeral_1h_input_tokens: 5000, ephemeral_5m_input_tokens: 0 } } } }) as never)
  const draw = await setup($, on, [])
  expect(await draw()).toContain('WARM 3m')
  await $.tool.call({ tool: 'Agent', prompt: 'Go.', description: 'probe' } as never)
  expect(await draw()).toContain('WARM 58m')
})
