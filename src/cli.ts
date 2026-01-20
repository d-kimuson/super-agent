#!/usr/bin/env node

import { Command } from 'commander';
import { homedir } from 'node:os';
import { join } from 'node:path';
import packageJson from '../package.json' with { type: 'json' };
import { logger } from './lib/logger';
import { loadConfig } from './mcp/config';
import { startServer } from './mcp/server';

const program = new Command();

program
  // meta
  .name(packageJson.name)
  .version(packageJson.version)
  .description(packageJson.description);

const mcpCommand = program.command('mcp').description('MCP server management');

mcpCommand
  .command('serve')
  .description('Start MCP server')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options: { config?: string }) => {
    try {
      logger.setLoggerType('stderr');
      logger.info('Loading configuration...');

      const home = homedir();
      const agentDirs = [join(home, '.agent-bridge', 'agents')];

      const config = await loadConfig({
        configPath: options.config,
        agentDirs,
      });

      logger.info(`Loaded ${config.agents.length} agent(s)`);

      if (config.agents.length === 0) {
        logger.warn('No agents found. Please check your agent directories.');
      }

      logger.info('Starting MCP server...');
      await startServer(config);
    } catch (error) {
      logger.error('Failed to start MCP server:', error);
      process.exit(1);
    }
  });

const main = async () => {
  await program.parseAsync(process.argv);
};

main().catch((error: unknown) => {
  logger.error(error);
  process.exit(1);
});
