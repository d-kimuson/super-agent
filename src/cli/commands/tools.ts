import { Command, type Command as CommandType } from 'commander';
import { env } from '../../config/env';
import { loadContext } from '../../config/loadContext';
import { cliArgsSchema, providersSchema } from '../../config/schema';
import { AgentToolsService } from '../../core/AgentToolsService';
import { logger } from '../../lib/logger';

type GlobalOptions = {
  ssaDir?: string;
  availableProviders?: string;
  disabledModels?: string;
  agentsDir?: string;
  skillsDir?: string;
};

export const createToolsCommand = () => {
  const toolsCommand = new Command('tools');
  toolsCommand.description('Execute MCP server tools directly from CLI');

  toolsCommand
    .command('agent-task')
    .description('Execute a task using a configured AI agent')
    .requiredOption('-p, --prompt <prompt>', 'The instruction/prompt for the agent')
    .option('--agent-type <type>', 'The agent to use for this task')
    .option(
      '-r, --resume <sessionId>',
      'Optional session ID to continue from a previous conversation',
    )
    .option(
      '--disabled-sdk-types <types>',
      'Comma-separated list of SDK types to exclude (e.g., claude,codex)',
    )
    .option('-o, --output-format <format>', 'Output format: message (default) or json', 'message')
    .action(async function (
      this: CommandType,
      options: {
        agentType?: string;
        prompt: string;
        resume?: string;
        disabledSdkTypes?: string;
        outputFormat: string;
      },
    ) {
      try {
        // 親コマンドからグローバルオプションを取得
        const rootCommand = this.parent?.parent;
        const opts = rootCommand?.opts<GlobalOptions>();

        // CLI args を構築
        const cliArgs = cliArgsSchema.parse({
          'ssa-dir': opts?.ssaDir,
          'available-providers': opts?.availableProviders,
          'disabled-models': opts?.disabledModels,
          'agents-dir': opts?.agentsDir,
          'skills-dir': opts?.skillsDir,
        });

        // context を読み込み
        const context = await loadContext({
          cliArgs,
          envVars: {
            SA_DIR: env.getEnv('SA_DIR'),
            SA_AVAILABLE_PROVIDERS: env.getEnv('SA_AVAILABLE_PROVIDERS'),
            SA_DISABLED_MODELS: env.getEnv('SA_DISABLED_MODELS'),
            SA_AGENT_DIRS: env.getEnv('SA_AGENT_DIRS'),
            SA_SKILL_DIRS: env.getEnv('SA_SKILL_DIRS'),
          },
        });

        const superSubagents = AgentToolsService(context);

        // Parse disabledSdkTypes from comma-separated string
        const disabledSdkTypes =
          options.disabledSdkTypes !== undefined && options.disabledSdkTypes.length > 0
            ? options.disabledSdkTypes
                .split(',')
                .map((s) => s.trim())
                .filter((s): s is 'claude' | 'codex' | 'copilot' | 'gemini' => {
                  const parsed = providersSchema.safeParse(s);
                  if (!parsed.success) {
                    logger.warn(`Invalid SDK type ignored: ${s}`);
                    return false;
                  }
                  return true;
                })
            : undefined;

        // agent-task を実行
        const result = await superSubagents.agentTask({
          agentType: options.agentType,
          cwd: process.cwd(),
          prompt: options.prompt,
          resume: options.resume,
          runInBackground: false,
          disabledSdkTypes,
        });

        // 結果を出力
        if (result.success) {
          if (options.outputFormat === 'json') {
            logger.info(JSON.stringify(result, null, 2));
          } else {
            logger.info(result.message);
          }
          process.exit(0);
        } else {
          if (options.outputFormat === 'json') {
            logger.error(JSON.stringify(result, null, 2));
          } else {
            logger.error(result.message);
          }
          process.exit(1);
        }
      } catch (error) {
        logger.error('Failed to execute agent-task:', error);
        process.exit(1);
      }
    });

  return toolsCommand;
};
