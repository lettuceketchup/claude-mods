# claude-mods

Claude Code mods.

- **crew**: running subagents in a band above the prompt, with their task, model and effort, current tool, time and estimated cost.
- **meter**: usage limits, prompt-cache timer, context and spend in a band above the prompt.

## Install

At the prompt of a terminal session:

```
/plugin install crew --marketplace lettuceketchup/claude-mods
/plugin install meter --marketplace lettuceketchup/claude-mods
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```bash
claude plugin install crew --marketplace lettuceketchup/claude-mods
claude plugin install meter --marketplace lettuceketchup/claude-mods
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `lettuceketchup/claude-mods`, then Add plugin.
