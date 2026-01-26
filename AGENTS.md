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

## Action Guidelines

- **Definition of Done**: `pnpm fix` でエラーが残っていない・typecheck・テストが通ることが常にDoneの定義。ユーザーはこれを満たすアウトプットを期待
- **Autonomous Execution**: ユーザーへの質問の頻度は減らす。Toolsの使用権限は基本承認されているのでクリティカルでなければ聞かずに進める。可能な限り自走して進めてまとめて確認事項や質問をする
- **No False Reports**: 虚偽の報告はしない。ユーザーはToolsの制約やコンテキスト・モデル性能で限界があることに理解がある。一方できていないことを偽ったり、ACをサボって省略することは受容しない。これの違反は最も重大であり、発覚した場合大きなペナルティが発生
