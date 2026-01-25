# @kimuson/super-agent

`@kimuson/super-agent` is a small adapter layer that lets you access multiple Agent SDKs through a unified interface.

Target SDKs:

- Codex
- Copilot
- Claude Code
- Gemini

This repository aims to make it easy to switch providers without rewriting your integration code.

## Install

```bash
pnpm add @kimuson/super-agent
```

## Packages

- `@kimuson/super-agent`
  CLI entrypoint (primarily for exposing MCP)

- `@kimuson/super-agent/sdk`
  TypeScript SDK entrypoint (for importing from your app)

## License

MIT
