# Development Guide

## Setup

```bash
# Install dependencies
pnpm install
```

## Building

```bash
# Build the project
pnpm build
```

## Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui
```

## Type Checking

```bash
# Type check
pnpm typecheck
```

## Linting and Formatting

```bash
# Lint
pnpm lint

# Fix linting issues and format code
pnpm fix
```

## Project Structure

```
src/
├── agent-sdk/          # SDK adapters for each provider
│   ├── adapters/
│   │   ├── claude/
│   │   ├── codex/
│   │   ├── copilot/
│   │   └── gemini-cli/
│   └── AgentSdk.ts     # Unified SDK interface
├── cli/                # CLI commands
│   ├── commands/
│   │   ├── mcp.ts      # MCP server command
│   │   ├── setup.ts    # Setup wizard
│   │   ├── tools.ts    # Direct tool execution
│   │   └── show-context.ts
│   └── index.ts
├── config/             # Configuration loading and schema
│   ├── markdown/       # Agent/skill markdown loaders
│   ├── loadConfig.ts
│   ├── loadContext.ts
│   └── schema.ts
├── core/               # Agent orchestration logic
│   ├── AgentToolsService.ts
│   ├── composePrompt.ts
│   ├── selectModel.ts
│   └── stoppedSessionToResult.ts
├── mcp/                # MCP server implementation
│   └── server.ts
├── workflow/           # Workflow engine
│   ├── engine.ts
│   ├── executors.ts
│   ├── expression.ts
│   ├── loader.ts
│   └── template.ts
└── sdk.ts              # SDK entrypoint
```

## Key Patterns

### Functional Style

The codebase uses factory functions returning objects rather than classes:

```typescript
export const AgentSdk = () => {
  // State
  const sessionMap = new Map();

  // Methods
  const startSession = async (input) => { ... };
  const prompt = async (input) => { ... };

  return {
    startSession,
    prompt,
    // ... other methods
  };
};
```

### SDK Adapters

Each provider has its own adapter in `src/agent-sdk/adapters/`:

- `claude/` - Claude Code adapter
- `codex/` - OpenAI Codex adapter
- `copilot/` - GitHub Copilot CLI adapter
- `gemini-cli/` - Google Gemini CLI adapter

All adapters implement a unified interface defined in `types.ts`.

### Configuration Loading

Configuration is loaded with the following priority:

1. CLI arguments (highest priority)
2. Environment variables
3. `~/.super-agent/config.local.json` (git-ignored overrides)
4. `~/.super-agent/config.json` (default config)

### Agent and Skill Loading

- **Agents**: Loaded from `.md` files in configured `agentDirs`
- **Skills**: Loaded from `<skill-name>/SKILL.md` in configured `skillDirs`

Both use YAML front matter for metadata and Markdown content for prompts.

## Testing Philosophy

- **Unit-centric**: Focus on unit tests for core logic
- **Type-safe**: Leverage TypeScript's type system
- **Fast**: Tests should run quickly
- **No mocks when possible**: Prefer real implementations

## Code Quality Standards

- **No `any`**: Use `unknown` with type guards instead
- **No type assertions**: Avoid `as` unless absolutely necessary
- **Algebraic data types**: Use discriminated unions for state
- **Functional style**: Prefer pure functions and immutability

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Ensure `pnpm fix` passes with no errors
5. Ensure `pnpm typecheck` passes
6. Ensure `pnpm test` passes
7. Submit a pull request
