import { select } from '@inquirer/prompts';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { configFileSchema } from '../../config/schema';
import { logger } from '../../lib/logger';

type SetupAnswers = {
  addClaudeAgents: boolean;
  addClaudeSkills: boolean;
  addCodexSkills: boolean;
  addGithubSkills: boolean;
  addGeminiSkills: boolean;
  defaultProvider: 'claude' | 'codex' | 'copilot' | 'gemini';
  defaultModel: string;
};

export const createSetupCommand = () => {
  const setupCommand = new Command('setup');
  setupCommand.description('Interactive setup for Super Subagents configuration');

  setupCommand.action(async () => {
    try {
      logger.info('🚀 Starting Super Subagents setup\n');

      const configDir = resolve(homedir(), '.super-subagents');
      const configPath = resolve(configDir, 'config.json');

      // Warn if existing config file exists
      if (existsSync(configPath)) {
        const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
          {
            type: 'confirm',
            name: 'overwrite',
            message: 'Existing config file found. Overwrite?',
            default: true,
          },
        ]);

        if (!overwrite) {
          logger.info('Setup cancelled');
          return;
        }
      }

      // Collect settings interactively
      const answers = await inquirer.prompt<Omit<SetupAnswers, 'defaultProvider'>>([
        {
          type: 'confirm',
          name: 'addClaudeAgents',
          message: 'Add Claude Code agents directory (~/.claude/agents)?',
          default: true,
        },
        {
          type: 'confirm',
          name: 'addClaudeSkills',
          message: 'Add Claude skills directory (~/.claude/skills)?',
          default: true,
        },
        {
          type: 'confirm',
          name: 'addCodexSkills',
          message: 'Add Codex skills directory (~/.codex/skills)?',
          default: true,
        },
        {
          type: 'confirm',
          name: 'addGithubSkills',
          message: 'Add GitHub skills directory (.github/skills)?',
          default: true,
        },
        {
          type: 'confirm',
          name: 'addGeminiSkills',
          message: 'Add Gemini skills directory (.gemini/skills)?',
          default: true,
        },
      ]);

      // Use select for provider choice (radio button style)
      const defaultProvider = await select({
        message: 'Select default provider:',
        choices: [
          { name: 'Claude', value: 'claude' },
          { name: 'Codex', value: 'codex' },
          { name: 'Copilot', value: 'copilot' },
          { name: 'Gemini', value: 'gemini' },
        ],
        default: 'claude',
      });

      // Ask for default model after provider selection
      const modelAnswer = await inquirer.prompt<Pick<SetupAnswers, 'defaultModel'>>([
        {
          type: 'input',
          name: 'defaultModel',
          message: 'Specify default model (leave empty to skip):',
          default: '',
        },
      ]);

      // Build agentDirs
      const agentDirs: string[] = [resolve(configDir, 'agents')];
      if (answers.addClaudeAgents) {
        agentDirs.push(resolve(homedir(), '.claude', 'agents'));
      }

      // Build skillDirs
      const skillDirs: string[] = [resolve(configDir, 'skills')];
      if (answers.addClaudeSkills) {
        skillDirs.push(resolve(homedir(), '.claude', 'skills'));
      }
      if (answers.addCodexSkills) {
        skillDirs.push(resolve(homedir(), '.codex', 'skills'));
      }
      if (answers.addGithubSkills) {
        skillDirs.push(resolve(homedir(), '.github', 'skills'));
      }
      if (answers.addGeminiSkills) {
        skillDirs.push(resolve(homedir(), '.gemini', 'skills'));
      }

      // Create config file with defaultModel
      const config = configFileSchema.parse({
        defaultModel:
          defaultProvider !== undefined
            ? {
                sdkType: defaultProvider,
                model: modelAnswer.defaultModel === '' ? undefined : modelAnswer.defaultModel,
              }
            : undefined,
        agentDirs,
        skillDirs,
      });

      // Create directory
      await mkdir(configDir, { recursive: true });

      // Create agents and skills directories
      await mkdir(resolve(configDir, 'agents'), { recursive: true });
      await mkdir(resolve(configDir, 'skills'), { recursive: true });

      // Write config file
      await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

      logger.info(`\n✅ Config file created: ${configPath}`);
      logger.info(`\n📁 Directories created:`);
      logger.info(`  - ${resolve(configDir, 'agents')}`);
      logger.info(`  - ${resolve(configDir, 'skills')}`);

      if (config.defaultModel !== undefined) {
        logger.info(
          `\n💡 Default model set to: ${config.defaultModel.sdkType}${config.defaultModel.model !== '' ? `:${config.defaultModel.model}` : ''}`,
        );
        logger.info('   To override, use environment variable:');
        logger.info('   export SSA_DEFAULT_MODEL="provider:model-name"');
      } else {
        logger.info(`\n💡 To set default model, use environment variable:`);
        logger.info('   export SSA_DEFAULT_MODEL="provider:model-name"');
      }

      logger.info(`\n🎉 Setup completed!`);
    } catch (error) {
      logger.error('Setup failed:', error);
      process.exit(1);
    }
  });

  return setupCommand;
};
