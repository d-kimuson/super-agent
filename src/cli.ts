#!/usr/bin/env node

import { Command } from 'commander';
import { homedir } from 'node:os';
import { join } from 'node:path';
import packageJson from '../package.json' with { type: 'json' };
import { logger } from './lib/logger';
import { loadConfig } from './mcp/config';
import { startServer as startMcpServer } from './mcp/server';
import { startServer as startHttpServer } from './server';

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
      const skillDirs = [join(home, '.agent-bridge', 'skills')];

      const config = await loadConfig({
        configPath: options.config,
        agentDirs,
        skillDirs,
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

program
  .command('serve')
  .description('Start HTTP server')
  .option('-c, --config <path>', 'Path to config file')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('-h, --hostname <hostname>', 'Hostname to bind to', '127.0.0.1')
  .action(async (options: { config?: string; port: string; hostname: string }) => {
    try {
      logger.info('Loading configuration...');

      const home = homedir();
      const agentDirs = [join(home, '.agent-bridge', 'agents')];
      const skillDirs = [join(home, '.agent-bridge', 'skills')];

      const config = await loadConfig({
        configPath: options.config,
        agentDirs,
        skillDirs,
      });

      logger.info(`Loaded ${config.agents.length} agent(s), ${config.skills.length} skill(s)`);

      if (config.agents.length === 0) {
        logger.warn('No agents found. Please check your agent directories.');
      }

      const port = Number.parseInt(options.port, 10);
      logger.info(`Starting HTTP server on ${options.hostname}:${port}...`);

      startHttpServer({
        config,
        port,
        hostname: options.hostname,
      });

      logger.info(`Server started at http://${options.hostname}:${port}`);
    } catch (error) {
      logger.error('Failed to start HTTP server:', error);
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
