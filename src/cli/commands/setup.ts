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
  agentDirs: string[];
  skillDirs: string[];
  availableProviders: Provider[];
  defaultProvider: Provider;
  defaultModel: string;
};

type Provider = 'claude' | 'codex' | 'copilot' | 'gemini';
type SetupPromptAnswers = Pick<SetupAnswers, 'agentDirs' | 'skillDirs' | 'availableProviders'>;

const formatHomePath = (path: string): string => {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
};

export const createSetupCommand = () => {
  const setupCommand = new Command('setup');
  setupCommand.description('Interactive setup for Super Subagents configuration');

  setupCommand.action(async () => {
    try {
      logger.info('🚀 Starting Super Subagents setup\n');

      const configDir = resolve(homedir(), '.super-agent');
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

      const agentDirChoices = [
        { name: formatHomePath(resolve(configDir, 'agents')), value: resolve(configDir, 'agents') },
        { name: '~/.claude/agents', value: resolve(homedir(), '.claude', 'agents') },
      ];
      const skillDirChoices = [
        { name: formatHomePath(resolve(configDir, 'skills')), value: resolve(configDir, 'skills') },
        { name: '~/.claude/skills', value: resolve(homedir(), '.claude', 'skills') },
        { name: '~/.codex/skills', value: resolve(homedir(), '.codex', 'skills') },
        { name: '~/.github/skills', value: resolve(homedir(), '.github', 'skills') },
        { name: '~/.gemini/skills', value: resolve(homedir(), '.gemini', 'skills') },
      ];

      const providerChoices: Array<{ name: string; value: Provider }> = [
        { name: 'Claude', value: 'claude' },
        { name: 'Codex', value: 'codex' },
        { name: 'Copilot', value: 'copilot' },
        { name: 'Gemini', value: 'gemini' },
      ];

      // Collect settings interactively
      const answers = await inquirer.prompt<SetupPromptAnswers>([
        {
          type: 'checkbox',
          name: 'agentDirs',
          message: '追加するagents dirを選んでください',
          choices: agentDirChoices,
          default: agentDirChoices.map((choice) => choice.value),
          validate: (input: string[]) =>
            input.length > 0 ? true : '少なくとも1つ選択してください。',
        },
        {
          type: 'checkbox',
          name: 'skillDirs',
          message: '追加するskills dirを選んでください',
          choices: skillDirChoices,
          default: skillDirChoices.map((choice) => choice.value),
          validate: (input: string[]) =>
            input.length > 0 ? true : '少なくとも1つ選択してください。',
        },
        {
          type: 'checkbox',
          name: 'availableProviders',
          message: '利用可能なproviderを選んでください',
          choices: providerChoices,
          default: false,
          validate: (input: Provider[]) =>
            input.length > 0 ? true : '少なくとも1つ選択してください。',
        },
      ]);

      const availableProviderChoices = providerChoices.filter((choice) =>
        answers.availableProviders.includes(choice.value),
      );
      const defaultProviderChoice =
        answers.availableProviders.find((provider) => provider === 'claude') ??
        answers.availableProviders[0];

      // Use select for provider choice (radio button style)
      const defaultProvider = await select({
        message: 'Select default provider:',
        choices: availableProviderChoices,
        default: defaultProviderChoice,
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

      // Create config file with defaultModel
      const config = configFileSchema.parse({
        defaultModel:
          defaultProvider !== undefined
            ? {
                sdkType: defaultProvider,
                model: modelAnswer.defaultModel === '' ? undefined : modelAnswer.defaultModel,
              }
            : undefined,
        agentDirs: answers.agentDirs,
        skillDirs: answers.skillDirs,
        availableProviders: answers.availableProviders,
      });

      // Create directory
      await mkdir(configDir, { recursive: true });

      // Create agents and skills directories
      if (answers.agentDirs.includes(resolve(configDir, 'agents'))) {
        await mkdir(resolve(configDir, 'agents'), { recursive: true });
      }
      if (answers.skillDirs.includes(resolve(configDir, 'skills'))) {
        await mkdir(resolve(configDir, 'skills'), { recursive: true });
      }

      // Write config file
      await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

      logger.info(`\n✅ Config file created: ${configPath}`);
      logger.info(`\n📁 Directories configured:`);
      answers.agentDirs.forEach((dir) => logger.info(`  - ${dir}`));
      answers.skillDirs.forEach((dir) => logger.info(`  - ${dir}`));

      logger.info('\n📝 Want to keep local tweaks out of version control?');
      logger.info(`   Use ${resolve(configDir, 'config.local.json')} for overrides.`);

      logger.info(`\n🎉 Setup completed!`);
    } catch (error) {
      logger.error('Setup failed:', error);
      process.exit(1);
    }
  });

  return setupCommand;
};
