import { describe, expect, it } from 'vitest';
import {
  mergeClaudeSettings,
  mergeClaudeSettingsConfig,
  mergeCodexMcpConfig,
  mergeCodexMcpServer,
} from './structuredMerge';

describe('mergeClaudeSettings', () => {
  it('adds Task/TaskOutput into permissions.deny without clobbering other keys', () => {
    const result = mergeClaudeSettings({
      current: { foo: 'bar' },
      denyTools: ['Task', 'TaskOutput'],
    });

    expect(result.code).toBe('success');
    if (result.code !== 'success') return;

    expect(result.changed).toBe(true);
    expect(result.next['foo']).toBe('bar');
    expect(result.next['permissions']).toEqual({ deny: ['Task', 'TaskOutput'] });
  });

  it('dedupes deny entries', () => {
    const result = mergeClaudeSettings({
      current: { permissions: { deny: ['Task'] } },
      denyTools: ['Task', 'TaskOutput'],
    });

    expect(result.code).toBe('success');
    if (result.code !== 'success') return;

    expect(result.next['permissions']).toEqual({ deny: ['Task', 'TaskOutput'] });
  });

  it('fails on non-object root', () => {
    const result = mergeClaudeSettings({
      current: ['oops'],
      denyTools: ['Task'],
    });
    expect(result).toEqual({ code: 'invalid', message: 'settings.json root must be an object' });
  });
});

describe('mergeClaudeSettingsConfig', () => {
  it('merges deny list without removing other keys', () => {
    const result = mergeClaudeSettingsConfig({
      current: { foo: 'bar', permissions: { allow: ['ToolA'] } },
      denyToolNames: ['Task', 'TaskOutput'],
    });

    expect(result.code).toBe('success');
    if (result.code !== 'success') return;

    expect(result.value['foo']).toBe('bar');
    expect(result.value['permissions']).toEqual({ allow: ['ToolA'], deny: ['Task', 'TaskOutput'] });
  });

  it('dedupes deny entries', () => {
    const result = mergeClaudeSettingsConfig({
      current: { permissions: { deny: ['Task'] } },
      denyToolNames: ['Task', 'TaskOutput'],
    });

    expect(result.code).toBe('success');
    if (result.code !== 'success') return;

    expect(result.value['permissions']).toEqual({ deny: ['Task', 'TaskOutput'] });
  });
});

describe('mergeCodexMcpServer', () => {
  it('sets tool_timeout_sec and ensures command/args if missing', () => {
    const result = mergeCodexMcpServer({
      current: { other: 1 },
      serverName: 'super-agent',
      toolTimeoutSec: 300,
      ensureCommand: { command: 'npx', args: ['-y', '@kimuson/super-agent', 'mcp', 'serve'] },
      disableTools: ['Task', 'TaskOutput'],
    });

    expect(result.code).toBe('success');
    if (result.code !== 'success') return;

    expect(result.changed).toBe(true);
    expect(result.next['other']).toBe(1);
    expect(result.next['mcp_servers']).toEqual({
      'super-agent': {
        command: 'npx',
        args: ['-y', '@kimuson/super-agent', 'mcp', 'serve'],
        tool_timeout_sec: 300,
        disabled_tools: ['Task', 'TaskOutput'],
      },
    });
  });

  it('does not override existing command/args and dedupes disabled_tools', () => {
    const result = mergeCodexMcpServer({
      current: {
        mcp_servers: {
          'super-agent': {
            command: 'node',
            args: ['x'],
            disabled_tools: ['Task'],
          },
        },
      },
      serverName: 'super-agent',
      toolTimeoutSec: 300,
      ensureCommand: { command: 'npx', args: ['-y', '@kimuson/super-agent', 'mcp', 'serve'] },
      disableTools: ['Task', 'TaskOutput'],
    });

    expect(result.code).toBe('success');
    if (result.code !== 'success') return;

    expect(result.next['mcp_servers']).toEqual({
      'super-agent': {
        command: 'node',
        args: ['x'],
        disabled_tools: ['Task', 'TaskOutput'],
        tool_timeout_sec: 300,
      },
    });
  });

  it('fails on invalid mcp_servers type', () => {
    const result = mergeCodexMcpServer({
      current: { mcp_servers: 1 },
      serverName: 'super-agent',
      toolTimeoutSec: 300,
      ensureCommand: { command: 'npx', args: ['-y', '@kimuson/super-agent', 'mcp', 'serve'] },
    });
    expect(result).toEqual({ code: 'invalid', message: 'mcp_servers must be an object' });
  });
});

describe('mergeCodexMcpConfig', () => {
  it('sets tool_timeout_sec and preserves unrelated keys', () => {
    const result = mergeCodexMcpConfig({
      current: { other: 1, mcp_servers: { other: { tool_timeout_sec: 10 } } },
      serverName: 'super-agent',
      toolTimeoutSec: 300,
    });

    expect(result.code).toBe('success');
    if (result.code !== 'success') return;

    expect(result.value['other']).toBe(1);
    expect(result.value['mcp_servers']).toEqual({
      other: { tool_timeout_sec: 10 },
      'super-agent': { tool_timeout_sec: 300 },
    });
  });

  it('dedupes disabled_tools entries', () => {
    const result = mergeCodexMcpConfig({
      current: { mcp_servers: { 'super-agent': { disabled_tools: ['Task'] } } },
      serverName: 'super-agent',
      toolTimeoutSec: 300,
    });

    expect(result.code).toBe('success');
    if (result.code !== 'success') return;

    expect(result.value['mcp_servers']).toEqual({
      'super-agent': { tool_timeout_sec: 300, disabled_tools: ['Task'] },
    });
  });
});
