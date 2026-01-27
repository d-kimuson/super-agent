import { describe, expect, it } from 'vitest';
import { mergeClaudeSettings, mergeCodexMcpServer } from './structuredMerge';

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
