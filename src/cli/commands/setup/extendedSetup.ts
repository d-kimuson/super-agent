import inquirer from 'inquirer';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { logger } from '../../../lib/logger';
import { runCommand, type RunCommandResult } from '../../utils/runCommand';
import { type UpdateTextFileResult } from '../../utils/structuredFile';
import {
  createEmptyToml,
  mergeClaudeSettingsConfig,
  mergeCodexMcpConfig,
} from '../../utils/structuredMerge';
import {
  readStructuredFileText,
  updateJsonFileValue,
  updateTomlFileValue,
} from '../../utils/updateStructuredFiles';

export type ExtendedSetupDeps = {
  readonly homeDir: string;
  readonly readStructuredFileText: typeof readStructuredFileText;
  readonly updateJsonFileValue: typeof updateJsonFileValue;
  readonly updateTomlFileValue: typeof updateTomlFileValue;
  readonly runCommand: typeof runCommand;
  readonly confirm: (params: { message: string; defaultValue: boolean }) => Promise<boolean>;
};

const defaultConfirm: ExtendedSetupDeps['confirm'] = async (params) => {
  const result = await inquirer.prompt<{ ok: boolean }>([
    { type: 'confirm', name: 'ok', message: params.message, default: params.defaultValue },
  ]);
  return result.ok;
};

const formatUpdateResult = (result: UpdateTextFileResult): string => {
  switch (result.code) {
    case 'updated':
      return 'updated';
    case 'no-change':
      return 'no-change';
    case 'parse-error':
      return `parse-error: ${result.message}`;
    case 'io-error':
      return `io-error: ${result.message}`;
    default:
      return 'unknown';
  }
};

const formatRunCommandResult = (result: RunCommandResult): string => {
  switch (result.code) {
    case 'success':
      return 'success';
    case 'failed':
      return `failed (exitCode=${result.exitCode})`;
    case 'spawn-error':
      return `spawn-error: ${result.message}`;
    default:
      return 'unknown';
  }
};

export const runExtendedSetup = async (deps?: Partial<ExtendedSetupDeps>): Promise<void> => {
  const resolvedDeps: ExtendedSetupDeps = {
    homeDir: deps?.homeDir ?? homedir(),
    readStructuredFileText: deps?.readStructuredFileText ?? readStructuredFileText,
    updateJsonFileValue: deps?.updateJsonFileValue ?? updateJsonFileValue,
    updateTomlFileValue: deps?.updateTomlFileValue ?? updateTomlFileValue,
    runCommand: deps?.runCommand ?? runCommand,
    confirm: deps?.confirm ?? defaultConfirm,
  };

  logger.info('\n🧩 Extended setup');

  const shouldRegisterMcp = await resolvedDeps.confirm({
    message: 'Claude に MCP サーバー (super-agent) を登録しますか？ (claude mcp add)',
    defaultValue: true,
  });

  if (shouldRegisterMcp) {
    logger.info('\n🔧 MCP サーバーを Claude に登録します...');
    const result = await resolvedDeps.runCommand({
      command: 'claude',
      args: [
        'mcp',
        'add',
        '-s',
        'user',
        'super-agent',
        '--',
        'npx',
        '-y',
        '@kimuson/super-agent',
        'mcp',
        'serve',
      ],
      inheritStdio: true,
    });

    if (result.code !== 'success') {
      logger.error(`Claude MCP 登録に失敗しました: ${formatRunCommandResult(result)}`);
    } else {
      logger.info('✅ Claude MCP 登録が完了しました');
    }
  } else {
    logger.info('⏭️  Claude MCP 登録をスキップしました');
  }

  const shouldDenyClaudeTools = await resolvedDeps.confirm({
    message: 'Claude Code で Task / TaskOutput Tools を無効化しますか？',
    defaultValue: true,
  });

  if (shouldDenyClaudeTools) {
    const settingsPath = resolve(resolvedDeps.homeDir, '.claude', 'settings.json');
    const result = await resolvedDeps.updateJsonFileValue({
      path: settingsPath,
      defaultObject: {},
      merge: (current) =>
        mergeClaudeSettingsConfig({
          current,
          denyToolNames: ['Task', 'TaskOutput'],
        }),
    });

    if (result.code !== 'updated' && result.code !== 'no-change') {
      logger.error(
        `Claude settings 更新に失敗しました (${settingsPath}): ${formatUpdateResult(result)}`,
      );
    } else {
      logger.info(`✅ Claude settings 更新: ${formatUpdateResult(result)} (${settingsPath})`);
    }
  } else {
    logger.info('⏭️  Claude Tool 無効化をスキップしました');
  }

  const shouldRegisterCodexMcp = await resolvedDeps.confirm({
    message: 'Codex に MCP サーバー (super-agent) を登録しますか？ (codex mcp add)',
    defaultValue: true,
  });

  if (shouldRegisterCodexMcp) {
    logger.info('\n🔧 MCP サーバーを Codex に登録します...');
    const result = await resolvedDeps.runCommand({
      command: 'codex',
      args: [
        'mcp',
        'add',
        'super-agent',
        '--',
        'npx',
        '-y',
        '@kimuson/super-agent',
        'mcp',
        'serve',
      ],
      inheritStdio: true,
    });

    if (result.code !== 'success') {
      logger.error(`Codex MCP 登録に失敗しました: ${formatRunCommandResult(result)}`);
    } else {
      logger.info('✅ Codex MCP 登録が完了しました');
    }
  } else {
    logger.info('⏭️  Codex MCP 登録をスキップしました');
  }

  const shouldUpdateCodexConfig = await resolvedDeps.confirm({
    message: 'Codex の MCP 設定を更新しますか？ (tool_timeout_sec=3600)',
    defaultValue: true,
  });

  if (shouldUpdateCodexConfig) {
    const codexConfigDir = resolve(resolvedDeps.homeDir, '.codex');
    const codexMcpTomlPath = resolve(codexConfigDir, 'mcp.toml');
    const codexConfigTomlPath = resolve(codexConfigDir, 'config.toml');

    const mcpReadResult = await resolvedDeps.readStructuredFileText({ path: codexMcpTomlPath });
    if (mcpReadResult.code !== 'success') {
      logger.error(
        `Codex mcp.toml の読み取りに失敗しました (${codexMcpTomlPath}): ${mcpReadResult.message}`,
      );
      return;
    }

    let targetPath = codexMcpTomlPath;
    if (!mcpReadResult.exists) {
      const configReadResult = await resolvedDeps.readStructuredFileText({
        path: codexConfigTomlPath,
      });
      if (configReadResult.code !== 'success') {
        logger.error(
          `Codex config.toml の読み取りに失敗しました (${codexConfigTomlPath}): ${configReadResult.message}`,
        );
        return;
      }
      if (configReadResult.exists) {
        targetPath = codexConfigTomlPath;
      }
    }

    const result = await resolvedDeps.updateTomlFileValue({
      path: targetPath,
      defaultObject: createEmptyToml(),
      merge: (current) =>
        mergeCodexMcpConfig({
          current,
          serverName: 'super-agent',
          toolTimeoutSec: 3600,
        }),
    });

    if (result.code !== 'updated' && result.code !== 'no-change') {
      logger.error(
        `Codex mcp 設定更新に失敗しました (${targetPath}): ${formatUpdateResult(result)}`,
      );
    } else {
      logger.info(`✅ Codex mcp 設定更新: ${formatUpdateResult(result)} (${targetPath})`);
    }
  } else {
    logger.info('⏭️  Codex MCP 設定更新をスキップしました');
  }
};
