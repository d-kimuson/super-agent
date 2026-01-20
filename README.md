# @kimuson/agent-bridge

`@kimuson/agent-bridge` is a small adapter layer that lets you access multiple Agent SDKs through a unified interface.

Target SDKs:

- Codex
- Copilot
- Claude Code
- Gemini

This repository aims to make it easy to switch providers without rewriting your integration code.

## Install

```bash
pnpm add @kimuson/agent-bridge
```

## Packages

- `@kimuson/agent-bridge`
  CLI entrypoint (primarily for exposing MCP)

- `@kimuson/agent-bridge/sdk`
  TypeScript SDK entrypoint (for importing from your app)

## License

MIT
