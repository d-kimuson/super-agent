import { resolve } from 'node:path';
import { loadConfig } from './loadConfig';
import { loadAgentsFromDirectory } from './markdown/agents';
import { loadSkillsFromDirectory } from './markdown/skills';
import { type CliArgs, type Config, configSchema, type EnvVars } from './schema';
import { type Context } from './types';

export type LoadContextOptions = {
  cliArgs?: Partial<CliArgs>;
  envVars?: Partial<EnvVars>;
  configFilePath?: string;
};

/**
 * Config file path を解決する
 * 優先順位: CliArgs > EnvVars > default
 */
const resolveConfigPath = (
  cliArgs: Partial<CliArgs>,
  envVars: Partial<EnvVars>,
): string | undefined => {
  const ssaDir = cliArgs['ssa-dir'] ?? envVars.SSA_DIR;
  if (ssaDir !== undefined && ssaDir !== '') {
    return resolve(ssaDir, 'config.json');
  }
  return undefined;
};

/**
 * Config をマージする
 * 優先順位: ConfigFile < EnvVars < CliArgs
 */
const mergeConfig = (
  configFile: { agentDirs?: string[]; skillDirs?: string[] },
  envVars: Partial<EnvVars>,
  cliArgs: Partial<CliArgs>,
): Config => {
  const merged = {
    ssaDir: cliArgs['ssa-dir'] ?? envVars.SSA_DIR,
    availableProviders:
      cliArgs['available-providers'] ??
      (envVars.SSA_AVAILABLE_PROVIDERS !== undefined && envVars.SSA_AVAILABLE_PROVIDERS.length > 0
        ? envVars.SSA_AVAILABLE_PROVIDERS
        : undefined),
    disabledModels:
      cliArgs['disabled-models'] ??
      (envVars.SSA_DISABLED_MODELS !== undefined && envVars.SSA_DISABLED_MODELS.length > 0
        ? envVars.SSA_DISABLED_MODELS
        : undefined),
    defaultModel: cliArgs['default-model'] ?? envVars.SSA_DEFAULT_MODEL,
    agentsDirs:
      cliArgs['agents-dir'] ??
      (envVars.SSA_AGENT_DIRS !== undefined && envVars.SSA_AGENT_DIRS.length > 0
        ? envVars.SSA_AGENT_DIRS
        : undefined) ??
      configFile.agentDirs,
    skillsDirs:
      cliArgs['skills-dir'] ??
      (envVars.SSA_SKILL_DIRS !== undefined && envVars.SSA_SKILL_DIRS.length > 0
        ? envVars.SSA_SKILL_DIRS
        : undefined) ??
      configFile.skillDirs,
  };

  return configSchema.parse(merged);
};

/**
 * Context を読み込む
 * Config を読み込み、agents と skills をマージ
 */
export const loadContext = async (options: LoadContextOptions = {}): Promise<Context> => {
  const cliArgs = options.cliArgs ?? {};
  const envVars = options.envVars ?? {};

  // Config file path を解決
  const configFilePath = options.configFilePath ?? resolveConfigPath(cliArgs, envVars);

  // Config file を読み込み
  const configFile = await loadConfig(configFilePath);

  // Config をマージ
  const config = mergeConfig(configFile, envVars, cliArgs);

  // agents と skills を並列で読み込み
  const [agentResults, skillResults] = await Promise.all([
    Promise.allSettled(config.agentsDirs.map(loadAgentsFromDirectory)),
    Promise.allSettled(config.skillsDirs.map(loadSkillsFromDirectory)),
  ]);

  // 成功した agents を抽出
  const agents = agentResults
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value);

  // 成功した skills を抽出
  const skills = skillResults
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value);

  return {
    config,
    agents: [
      {
        name: 'general',
        models: [config.defaultModel],
        prompt: '',
        description: 'General-purpose agent without any specialized instructions',
        skills: [],
      },
      ...agents,
    ],
    skills,
  };
};
