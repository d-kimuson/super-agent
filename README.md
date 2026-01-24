# @kimuson/super-subagents

`@kimuson/super-subagents` is a small adapter layer that lets you access multiple Agent SDKs through a unified interface.

Target SDKs:

- Codex
- Copilot
- Claude Code
- Gemini

This repository aims to make it easy to switch providers without rewriting your integration code.

## Install

```bash
pnpm add @kimuson/super-subagents
```

## Packages

- `@kimuson/super-subagents`
  CLI entrypoint (primarily for exposing MCP)

- `@kimuson/super-subagents/sdk`
  TypeScript SDK entrypoint (for importing from your app)

## License

MIT
