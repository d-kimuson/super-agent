import { Command, type Command as CommandType } from 'commander';
import { env } from '../../config/env';
import { loadContext } from '../../config/loadContext';
import { type CliArgs } from '../../config/schema';
import { logger } from '../../lib/logger';
import { startServer as startMcpServer } from '../../mcp/server';

type GlobalOptions = {
  ssaDir?: string;
  availableProviders?: string;
  disabledModels?: string;
  agentsDir?: string;
  skillsDir?: string;
};

export const createMcpCommand = () => {
  const mcpCommand = new Command('mcp');
  mcpCommand.description('MCP server management');

  mcpCommand
    .command('serve')
    .description('Start MCP server')
    .action(async function (this: CommandType) {
      try {
        logger.setLoggerType('stderr');
        logger.info('Loading configuration...');

        // 親コマンドからグローバルオプションを取得
        const rootCommand = this.parent?.parent;
        const opts = rootCommand?.opts<GlobalOptions>();

        // CLI args を構築（型チェックはランタイムで行う）
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

        // CLI args と env vars から context を読み込み
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

        logger.info(`Loaded ${context.agents.length} agent(s), ${context.skills.length} skill(s)`);

        if (context.agents.length === 0) {
          logger.warn('No agents found. Please check your agent directories.');
        }

        logger.info('Starting MCP server...');
        await startMcpServer(context);
      } catch (error) {
        logger.error('Failed to start MCP server:', error);
        process.exit(1);
      }
    });

  return mcpCommand;
};
