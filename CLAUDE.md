# CLAUDE.md (super-agent)

## Overview

Agent Bridge - unified adapter layer for multiple AI Agent SDKs (Claude, Codex, Copilot, Gemini CLI).

## Architecture

```
src/
├── core/           # AgentBridge and SDK adapters
│   ├── AgentBridge.ts        # Main bridge orchestrator
│   └── agent-sdks/{sdk}/     # SDK-specific adapters
├── mcp/            # MCP server implementation
├── lib/            # Shared utilities
├── cli.ts          # CLI entrypoint
└── sdk.ts          # SDK entrypoint
```

## Development

- Package manager: pnpm
- Build: `pnpm build`
- Test: `pnpm test`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`

## Key Patterns

- **Functional style**: Factory functions returning objects, not classes
- **Session state machine**: pending → running → paused/completed/failed
- **SDK adapters**: Implement unified interface for each AI provider
