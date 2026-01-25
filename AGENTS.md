## Overview

Super Agent - unified adapter layer for multiple AI Agent SDKs (Claude, Codex, Copilot, Gemini CLI).

## Architecture

```
src/
├── agent-sdk/      # SDK adapters (AgentSdk.ts, adapters/{claude,codex,copilot,gemini-cli}/)
├── cli/            # CLI (commands: mcp, setup, show-context, tools)
├── config/         # Configuration loading (loadConfig, loadContext, schema)
├── core/           # Core utilities (SuperSubagents, composePrompt, selectModel)
├── lib/            # Shared utilities (logger, controllablePromise)
├── mcp/            # MCP server (server.ts)
└── sdk.ts          # SDK entrypoint
```

## Development

- Package manager: pnpm
- Build: `pnpm build`
- Test: `pnpm test`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Fix: `pnpm fix`

## Key Patterns

- **Functional style**: Factory functions returning objects, not classes
- **SDK adapters**: Unified interface for each AI provider in `agent-sdk/adapters/`
