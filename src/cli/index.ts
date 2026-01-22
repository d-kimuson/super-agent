#!/usr/bin/env node

import { Command } from 'commander';
import packageJson from '../../package.json' with { type: 'json' };
import { logger } from '../lib/logger';
import { createMcpCommand } from './commands/mcp';
import { createServerCommand } from './commands/server';

export const createProgram = () => {
  const program = new Command();

  program
    // meta
    .name(packageJson.name)
    .version(packageJson.version)
    .description(packageJson.description);

  // commands
  program.addCommand(createMcpCommand());
  program.addCommand(createServerCommand());

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
