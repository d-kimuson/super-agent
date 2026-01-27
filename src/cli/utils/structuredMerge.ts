import * as TOML from '@iarna/toml';
import { z } from 'zod';
import { errorToString } from '../../lib/errorToString';

export type TomlJsonMap = ReturnType<typeof TOML.parse>;

const jsonRecordSchema = z.record(z.string(), z.unknown());
const stringArraySchema = z.array(z.string());
const numberSchema = z.number();

type EnsureJsonRecordResult =
  | { code: 'success'; value: Record<string, unknown> }
  | { code: 'invalid'; message: string };

const ensureJsonRecord = (value: unknown, label: string): EnsureJsonRecordResult => {
  const parsed = jsonRecordSchema.safeParse(value);
  if (!parsed.success) {
    return { code: 'invalid', message: `${label} must be an object` };
  }
  return { code: 'success', value: parsed.data };
};

type EnsureStringArrayResult =
  | { code: 'success'; value: string[] }
  | { code: 'invalid'; message: string };

const ensureStringArray = (value: unknown, label: string): EnsureStringArrayResult => {
  const parsed = stringArraySchema.safeParse(value);
  if (!parsed.success) {
    return { code: 'invalid', message: `${label} must be an array of strings` };
  }
  return { code: 'success', value: parsed.data };
};

type EnsureNumberResult = { code: 'success'; value: number } | { code: 'invalid'; message: string };

const ensureNumber = (value: unknown, label: string): EnsureNumberResult => {
  const parsed = numberSchema.safeParse(value);
  if (!parsed.success) {
    return { code: 'invalid', message: `${label} must be a number` };
  }
  return { code: 'success', value: parsed.data };
};

type EnsureTomlJsonMapResult =
  | { code: 'success'; value: TomlJsonMap }
  | { code: 'invalid'; message: string };

// Validates that a value is a plain object (non-null, non-array).
// When used on values from TOML.parse, the runtime type is guaranteed to be TomlJsonMap.
const tomlJsonMapSchema = z.custom<TomlJsonMap>(
  (val): val is TomlJsonMap => typeof val === 'object' && val !== null && !Array.isArray(val),
);

/**
 * Validates that a TOML AnyJson value is a TomlJsonMap (object table).
 * Preserves the TomlJsonMap type for downstream TOML operations.
 */
const ensureTomlJsonMap = (value: unknown, label: string): EnsureTomlJsonMapResult => {
  const parsed = tomlJsonMapSchema.safeParse(value);
  if (!parsed.success) {
    return { code: 'invalid', message: `${label} must be an object` };
  }
  return { code: 'success', value: parsed.data };
};

const addUniqueStrings = (existing: readonly string[], toAdd: readonly string[]): string[] => {
  const set = new Set<string>();
  for (const item of existing) set.add(item);
  for (const item of toAdd) set.add(item);
  return [...set];
};

export const parseJson = (
  text: string,
): { code: 'success'; value: unknown } | { code: 'error'; message: string } => {
  try {
    const value: unknown = JSON.parse(text);
    return { code: 'success', value };
  } catch (error: unknown) {
    return { code: 'error', message: errorToString(error) };
  }
};

export const formatJson = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';

export type MergeValueResult<TValue> =
  | { code: 'success'; value: TValue }
  | { code: 'invalid'; message: string };

export const mergeClaudeSettingsConfig = (params: {
  current: unknown;
  denyToolNames: readonly string[];
}): MergeValueResult<Record<string, unknown>> => {
  const rootResult = ensureJsonRecord(params.current, 'settings.json root');
  if (rootResult.code !== 'success') {
    return rootResult;
  }

  const permissionsRaw = rootResult.value['permissions'];
  const permissionsResult =
    permissionsRaw === undefined
      ? ({ code: 'success', value: {} } satisfies EnsureJsonRecordResult)
      : ensureJsonRecord(permissionsRaw, 'permissions');
  if (permissionsResult.code !== 'success') {
    return permissionsResult;
  }

  const denyRaw = permissionsResult.value['deny'];
  const denyResult =
    denyRaw === undefined
      ? ({ code: 'success', value: [] } satisfies EnsureStringArrayResult)
      : ensureStringArray(denyRaw, 'permissions.deny');
  if (denyResult.code !== 'success') {
    return denyResult;
  }

  const nextDeny = addUniqueStrings(denyResult.value, params.denyToolNames);
  const nextPermissions: Record<string, unknown> = {
    ...permissionsResult.value,
    deny: nextDeny,
  };
  const next: Record<string, unknown> = {
    ...rootResult.value,
    permissions: nextPermissions,
  };

  return { code: 'success', value: next };
};

export const mergeClaudeSettings = (params: {
  current: unknown;
  denyTools: readonly string[];
}):
  | { code: 'success'; next: Record<string, unknown>; changed: boolean }
  | { code: 'invalid'; message: string } => {
  const rootResult = ensureJsonRecord(params.current, 'settings.json root');
  if (rootResult.code !== 'success') {
    return rootResult;
  }

  const permissionsRaw = rootResult.value['permissions'];
  const permissionsResult =
    permissionsRaw === undefined
      ? ({ code: 'success', value: {} } satisfies EnsureJsonRecordResult)
      : ensureJsonRecord(permissionsRaw, 'permissions');
  if (permissionsResult.code !== 'success') {
    return permissionsResult;
  }

  const denyRaw = permissionsResult.value['deny'];
  const denyResult =
    denyRaw === undefined
      ? ({ code: 'success', value: [] } satisfies EnsureStringArrayResult)
      : ensureStringArray(denyRaw, 'permissions.deny');
  if (denyResult.code !== 'success') {
    return denyResult;
  }

  const nextDeny = addUniqueStrings(denyResult.value, params.denyTools);
  const changed = nextDeny.length !== denyResult.value.length;

  const nextPermissions: Record<string, unknown> = {
    ...permissionsResult.value,
    deny: nextDeny,
  };

  const next: Record<string, unknown> = {
    ...rootResult.value,
    permissions: nextPermissions,
  };

  return { code: 'success', next, changed };
};

export const parseToml = (
  text: string,
): { code: 'success'; value: TomlJsonMap } | { code: 'error'; message: string } => {
  try {
    return { code: 'success', value: TOML.parse(text) };
  } catch (error: unknown) {
    return { code: 'error', message: errorToString(error) };
  }
};

export const formatToml = (value: TomlJsonMap): string => TOML.stringify(value) + '\n';

export const createEmptyToml = (): TomlJsonMap => TOML.parse('');

export const mergeCodexMcpConfig = (params: {
  current: unknown;
  serverName: string;
  toolTimeoutSec: number;
}): MergeValueResult<TomlJsonMap> => {
  const rootResult = ensureTomlJsonMap(params.current, 'config.toml root');
  if (rootResult.code !== 'success') {
    return rootResult;
  }

  const root = rootResult.value;
  const mcpServersRaw = root['mcp_servers'];
  const mcpServersResult =
    mcpServersRaw === undefined
      ? ({ code: 'success', value: createEmptyToml() } satisfies EnsureTomlJsonMapResult)
      : ensureTomlJsonMap(mcpServersRaw, 'mcp_servers');
  if (mcpServersResult.code !== 'success') {
    return mcpServersResult;
  }

  const serverRaw = mcpServersResult.value[params.serverName];
  const serverResult =
    serverRaw === undefined
      ? ({ code: 'success', value: createEmptyToml() } satisfies EnsureTomlJsonMapResult)
      : ensureTomlJsonMap(serverRaw, `mcp_servers.${params.serverName}`);
  if (serverResult.code !== 'success') {
    return serverResult;
  }

  const nextServer: TomlJsonMap = { ...serverResult.value };
  const toolTimeoutRaw = nextServer['tool_timeout_sec'];
  if (toolTimeoutRaw !== undefined) {
    const toolTimeoutResult = ensureNumber(
      toolTimeoutRaw,
      `mcp_servers.${params.serverName}.tool_timeout_sec`,
    );
    if (toolTimeoutResult.code !== 'success') {
      return toolTimeoutResult;
    }
  }
  if (toolTimeoutRaw !== params.toolTimeoutSec) {
    nextServer['tool_timeout_sec'] = params.toolTimeoutSec;
  }

  const nextMcpServers: TomlJsonMap = {
    ...mcpServersResult.value,
    [params.serverName]: nextServer,
  };
  const next: TomlJsonMap = { ...root, mcp_servers: nextMcpServers };

  return { code: 'success', value: next };
};

export const mergeCodexMcpServer = (params: {
  current: TomlJsonMap;
  serverName: string;
  toolTimeoutSec: number;
  ensureCommand: { command: string; args: readonly string[] };
  disableTools?: readonly string[];
}):
  | { code: 'success'; next: TomlJsonMap; changed: boolean }
  | { code: 'invalid'; message: string } => {
  const root = params.current;

  const mcpServersRaw = root['mcp_servers'];
  const mcpServersResult =
    mcpServersRaw === undefined
      ? ({ code: 'success', value: {} } satisfies EnsureTomlJsonMapResult)
      : ensureTomlJsonMap(mcpServersRaw, 'mcp_servers');
  if (mcpServersResult.code !== 'success') {
    return mcpServersResult;
  }

  const serverRaw = mcpServersResult.value[params.serverName];
  const serverResult =
    serverRaw === undefined
      ? ({ code: 'success', value: {} } satisfies EnsureTomlJsonMapResult)
      : ensureTomlJsonMap(serverRaw, `mcp_servers.${params.serverName}`);
  if (serverResult.code !== 'success') {
    return serverResult;
  }

  const nextServer: TomlJsonMap = { ...serverResult.value };
  let changed = false;

  if (nextServer['command'] === undefined) {
    nextServer['command'] = params.ensureCommand.command;
    changed = true;
  }
  if (nextServer['args'] === undefined) {
    nextServer['args'] = [...params.ensureCommand.args];
    changed = true;
  }

  if (nextServer['tool_timeout_sec'] !== params.toolTimeoutSec) {
    nextServer['tool_timeout_sec'] = params.toolTimeoutSec;
    changed = true;
  }

  if (params.disableTools !== undefined) {
    const disabledRaw = nextServer['disabled_tools'];
    const disabledResult =
      disabledRaw === undefined
        ? ({ code: 'success', value: [] } satisfies EnsureStringArrayResult)
        : ensureStringArray(disabledRaw, `mcp_servers.${params.serverName}.disabled_tools`);

    if (disabledResult.code !== 'success') {
      return disabledResult;
    }

    const nextDisabled = addUniqueStrings(disabledResult.value, params.disableTools);
    if (nextDisabled.length !== disabledResult.value.length) {
      nextServer['disabled_tools'] = nextDisabled;
      changed = true;
    }
  }

  const nextMcpServers: TomlJsonMap = {
    ...mcpServersResult.value,
    [params.serverName]: nextServer,
  };
  const next: TomlJsonMap = { ...root, mcp_servers: nextMcpServers };

  return { code: 'success', next, changed };
};
