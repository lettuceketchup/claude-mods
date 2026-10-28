# To do

Upcoming and new features. Tick an item when it ships; put the version beside it.

## meter
- [x] Works on the API: no 5H/7D placeholder, cache assumed 5 min (0.3.0)
- [x] Cache lifetime read exactly from finished subagents, re-checked every turn (0.3.0)
- [ ] API spend budget: a "Budget (USD)" option that turns the cost red past it
- [ ] API rate limits (requests/tokens per minute): the engine doesn't report them to mods yet; add once `rateLimits` carries them
- [ ] Exact cache lifetime without a subagent (the main turn's usage has no 5m/1h split today)

## crew
- [ ] Price table is hardcoded: update it when model prices change
- [ ] Show the cache lifetime meter learned beside each agent's cost

## Repo
- [ ] Bring over glance and file-tracker from `~/.claude/local-mods` if they're still wanted
