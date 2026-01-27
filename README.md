# @kimuson/super-agent

A unified orchestration layer for AI agent SDKs (Claude Code, Codex, Copilot CLI, Gemini CLI) with intelligent fallback and sub-agent patterns.

## Overview

`@kimuson/super-agent` provides a standardized interface to interact with multiple AI agent providers through a single API. It enables sophisticated orchestration patterns where agents can dynamically delegate tasks to specialized sub-agents, with automatic fallback between providers based on availability, rate limits, and model capabilities.

## Key Features

### 🤖 Multi-Provider Orchestration

- **Unified Interface**: Single API to interact with Claude Code, Codex, Copilot CLI, and Gemini CLI
- **Intelligent Model Selection**: Configure multiple models per agent with priority-based fallback
- **Rate Limit Resilience**: Automatically switches to alternative providers when rate limits are hit
- **Environment-Based Configuration**: Different model preferences across personal and enterprise environments

### 🎯 Sub-Agent Pattern

- **MCP Server**: Expose AI agents as MCP tools for orchestration by parent agents
- **Agent Definitions**: Configure specialized agents with system prompts, skills, and model priorities
- **Task Delegation**: Parent agents can delegate specialized tasks to sub-agents via the `agent-task` tool
- **Session Management**: Continue conversations across multiple interactions with session IDs

### 🛠️ Flexible Integration

- **MCP Tools**: `agent-task` and `agent-task-output` for seamless integration with Claude Desktop and other MCP clients
- **TypeScript SDK**: Programmatic access for custom applications
- **CLI Commands**: Direct command-line interaction for development and testing

### 📋 Workflow Engine (WIP)

- **YAML Workflows**: Define multi-step agent workflows with conditional execution
- **Shell & Agent Steps**: Mix shell commands and AI agent tasks
- **Retry & Error Handling**: Built-in retry strategies and error management
- **Loop Blocks**: Iterative workflows with condition-based exit

## Use Cases

### Subscription-Based Model Optimization

When using subscription-based AI services, you're often limited to specific models. Super-agent enables:

- Use Claude Code for high-quality implementation while falling back to Codex during rate limits
- Delegate design tasks to OpenAI models while using Claude for implementation
- Route simple tasks to cost-efficient models like Gemini
- Balance request distribution across providers to avoid rate limits

### Cross-Environment Consistency

Maintain consistent agent definitions across different environments:

- Personal machine: Uses Codex subscription
- Work machine: Uses enterprise Claude license
- The same `agent-task` call works on both by automatically selecting available providers

### Sub-Agent Orchestration

After running setup, parent agents (like Claude Desktop) can delegate specialized tasks using the `agent-task` MCP tool:

```json
{
  "agentType": "engineer",
  "prompt": "Implement user authentication",
  "cwd": "/project",
  "disabledSdkTypes": ["claude"]
}
```

The tool automatically selects the best available provider based on your configuration and handles fallback when rate limits occur.

## Installation

```bash
# Install globally (recommended)
npm install -g @kimuson/super-agent@latest

# Or use with npx
npx -y @kimuson/super-agent@latest setup
```

## Quick Start

### 1. Setup Configuration

Run the interactive setup wizard:

```bash
npx -y @kimuson/super-agent@latest setup
```

This will:

- Create `~/.super-agent/config.json` with your provider and directory preferences
- Set up agent and skill directories
- Configure MCP server settings for Claude Desktop, Codex, and other tools

The setup wizard automatically configures MCP server settings, so you can immediately start using sub-agents from your AI tools.

## Configuration

### Agent Definition Example

Agent definitions are Markdown files with YAML front matter (following Claude Code agent format):

```markdown
## <!-- ~/.super-agent/agents/engineer.md -->

name: engineer
description: Full-stack engineer for implementation tasks
models:

- sdkType: claude
  model: sonnet
- sdkType: codex
  model: gpt-4
- sdkType: copilot
  skills:
- typescript

---

You are an expert full-stack engineer.
Write production-quality code with comprehensive tests.

## Requirements

- Follow TDD approach
- Ensure type safety
- Write clear documentation
```

### Config File

The setup command creates `~/.super-agent/config.json`:

```json
{
  "availableProviders": ["claude", "codex", "copilot", "gemini"],
  "defaultModel": {
    "sdkType": "claude",
    "model": "default"
  },
  "agentDirs": ["~/.super-agent/agents", "~/.claude/agents"],
  "skillDirs": ["~/.super-agent/skills", "~/.claude/skills"]
}
```

### 2. Using CLI Tools

For those who want to use super-agent via Skills or direct CLI instead of MCP:

```bash
# Execute a task with the default agent
super-agent tools agent-task -p 'Write a hello world function in Python'

# Use a specific agent type
super-agent tools agent-task --agent-type engineer -p 'Implement user authentication'

# Exclude specific providers (useful for fallback scenarios)
super-agent tools agent-task -p 'Review this code' --disabled-sdk-types claude,codex
```

## Architecture

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
├── config/             # Configuration loading and schema
├── core/               # Agent orchestration logic
├── mcp/                # MCP server implementation
└── sdk.ts              # SDK entrypoint
```

## Supported Providers

| Provider           | SDK Type  | Status       |
| ------------------ | --------- | ------------ |
| Claude Code        | `claude`  | ✅ Supported |
| OpenAI Codex       | `codex`   | ✅ Supported |
| GitHub Copilot CLI | `copilot` | ✅ Supported |
| Google Gemini CLI  | `gemini`  | ✅ Supported |

## Why Super-Agent?

**Problem**: Each AI agent SDK has its own API, making it difficult to:

- Switch providers without rewriting integration code
- Implement fallback strategies for rate limits or outages
- Orchestrate multiple agents with different capabilities
- Share agent definitions across environments with different subscriptions

**Solution**: Super-agent provides a unified orchestration layer that:

- Abstracts provider differences behind a single interface
- Automatically handles model selection and fallback
- Enables sub-agent patterns for sophisticated workflows
- Works consistently across different subscription models

## Development

See [docs/dev.md](./docs/dev.md) for development guide.

## License

MIT
