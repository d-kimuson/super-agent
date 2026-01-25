import { Command, type Command as CommandType } from 'commander';
import { env } from '../../config/env';
import { loadContext } from '../../config/loadContext';
import { cliArgsSchema } from '../../config/schema';
import { logger } from '../../lib/logger';

type GlobalOptions = {
  ssaDir?: string;
  availableProviders?: string;
  disabledModels?: string;
  agentsDir?: string;
  skillsDir?: string;
};

export const createShowContextCommand = () => {
  const showContextCommand = new Command('show-context');
  showContextCommand.description('Display the loaded configuration context as JSON');

  showContextCommand.action(async function (this: CommandType) {
    try {
      // 親コマンドからグローバルオプションを取得
      const rootCommand = this.parent;
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

      // prompt を省略した context を作成
      const contextWithTruncatedPrompts = {
        ...context,
        agents: context.agents.map((agent) => ({
          ...agent,
          prompt: agent.prompt.length > 10 ? `${agent.prompt.slice(0, 10)}...` : agent.prompt,
        })),
        skills: context.skills.map((skill) => ({
          ...skill,
          prompt: skill.prompt.length > 10 ? `${skill.prompt.slice(0, 10)}...` : skill.prompt,
        })),
      };

      // context を JSON 形式で出力
      logger.info(JSON.stringify(contextWithTruncatedPrompts, null, 2));
      process.exit(0);
    } catch (error) {
      logger.error('Failed to load context:', error);
      process.exit(1);
    }
  });

  return showContextCommand;
};
