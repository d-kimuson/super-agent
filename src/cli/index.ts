#!/usr/bin/env node

import { Command } from 'commander';
import packageJson from '../../package.json' with { type: 'json' };
import { logger } from '../lib/logger';
import { createMcpCommand } from './commands/mcp';
import { createToolsCommand } from './commands/tools';

export const createProgram = () => {
  const program = new Command();

  program
    // meta
    .name(packageJson.name)
    .version(packageJson.version)
    .description(packageJson.description)
    // global options
    .option('--ssa-dir <path>', 'Super Subagents directory')
    .option('--available-providers <providers>', 'Available providers (comma-separated)')
    .option('--disabled-models <models>', 'Disabled models (comma-separated)')
    .option('--default-model <model>', 'Default model (format: provider:model or provider)')
    .option('--agents-dir <paths>', 'Agent directories (comma-separated)')
    .option('--skills-dir <paths>', 'Skill directories (comma-separated)');

  // commands
  program.addCommand(createMcpCommand());
  program.addCommand(createToolsCommand());

  return program;
};

const main = async () => {
  try {
    const program = createProgram();
    await program.parseAsync(process.argv);
  } catch (error: unknown) {
    logger.error(error);
    process.exit(1);
  }
};

void main();
