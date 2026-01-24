import { Command, type Command as CommandType } from 'commander';
import { env } from '../../config/env';
import { loadContext } from '../../config/loadContext';
import { type CliArgs } from '../../config/schema';
import { SuperSubagents } from '../../core/SuperSubagents';
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
    .requiredOption('--agent-type <type>', 'The agent to use for this task')
    .requiredOption('--prompt <prompt>', 'The instruction/prompt for the agent')
    .option('--resume <sessionId>', 'Optional session ID to continue from a previous conversation')
    .option('--output-format <format>', 'Output format: message (default) or json', 'message')
    .action(async function (
      this: CommandType,
      options: {
        agentType: string;
        prompt: string;
        resume?: string;
        outputFormat: string;
      },
    ) {
      try {
        // 親コマンドからグローバルオプションを取得
        const rootCommand = this.parent?.parent;
        const opts = rootCommand?.opts<GlobalOptions>();

        // CLI args を構築
        const cliArgs: Partial<CliArgs> = {
          'ssa-dir': opts?.ssaDir,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          'available-providers': opts?.availableProviders?.split(',') as
            | ('claude' | 'codex' | 'copilot' | 'gemini')[]
            | undefined,
          'disabled-models': opts?.disabledModels?.split(','),
          'agents-dir': opts?.agentsDir?.split(','),
          'skills-dir': opts?.skillsDir?.split(','),
        };

        // context を読み込み
        const context = await loadContext({
          cliArgs,
          envVars: {
            SSA_DIR: env.getEnv('SSA_DIR'),
            SSA_AVAILABLE_PROVIDERS: env.getEnv('SSA_AVAILABLE_PROVIDERS'),
            SSA_DISABLED_MODELS: env.getEnv('SSA_DISABLED_MODELS'),
            SSA_AGENT_DIRS: env.getEnv('SSA_AGENT_DIRS'),
            SSA_SKILL_DIRS: env.getEnv('SSA_SKILL_DIRS'),
          },
        });

        const superSubagents = SuperSubagents(context);

        // agent-task を実行
        const result = await superSubagents.agentTask({
          agentType: options.agentType,
          prompt: options.prompt,
          resume: options.resume,
          runInBackground: false,
        });

        // 結果を出力
        if (result.success) {
          if (options.outputFormat === 'json') {
          } else {
            logger.info('Task completed successfully');
            if ('message' in result && result.message) {
            }
          }
          process.exit(0);
        } else {
          if (options.outputFormat === 'json') {
          } else {
            logger.error('Task failed');
            if ('message' in result && result.message) {
            }
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
