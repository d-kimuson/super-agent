import { Command } from 'commander';
import { loadConfig } from '../../config/loadConfig';
import { logger } from '../../lib/logger';
import { paths } from '../../lib/paths';
import { startServer as startMcpServer } from '../../mcp/server';

export const createMcpCommand = () => {
  const mcpCommand = new Command('mcp');
  mcpCommand.description('MCP server management');

  mcpCommand
    .command('serve')
    .description('Start MCP server')
    .action(async () => {
      try {
        logger.setLoggerType('stderr');
        logger.info('Loading configuration...');

        const config = await loadConfig({
          configPath: paths.configFile,
          agentDirs: [paths.agentsDir],
          skillDirs: [paths.skillsDir],
        });

        logger.info(`Loaded ${config.agents.length} agent(s), ${config.skills.length} skill(s)`);

        if (config.agents.length === 0) {
          logger.warn('No agents found. Please check your agent directories.');
        }

        logger.info('Starting MCP server...');
        await startMcpServer(config);
      } catch (error) {
        logger.error('Failed to start MCP server:', error);
        process.exit(1);
      }
    });

  return mcpCommand;
};
