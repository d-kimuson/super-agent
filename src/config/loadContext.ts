import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { loadConfig } from './loadConfig';
import { loadAgentsFromDirectory } from './markdown/agents';
import { loadSkillsFromDirectory } from './markdown/skills';
import {
  type CliArgs,
  type Config,
  type ConfigFile,
  configSchema,
  type EnvVars,
  type ParsedEnvVars,
  parsedEnvVarsSchema,
} from './schema';
import { type Context } from './types';

export type LoadContextOptions = {
  cliArgs?: Partial<CliArgs>;
  envVars?: Partial<EnvVars>;
};

/**
 * Config file path を解決する
 * 優先順位: CliArgs > EnvVars > default
 */
const resolveConfigPath = (
  cliArgs: Partial<CliArgs>,
  envVars: Partial<ParsedEnvVars>,
): string | undefined => {
  const ssaDir = cliArgs['ssa-dir'] ?? envVars.SA_DIR ?? resolve(homedir(), '.super-agent');
  return resolve(ssaDir, 'config.json');
};

/**
 * EnvVars を ParsedEnvVars に変換する
 */
const parseEnvVars = (envVars: Partial<EnvVars>): Partial<ParsedEnvVars> => {
  return parsedEnvVarsSchema.partial().parse({
    SA_DIR: envVars.SA_DIR,
    SA_AVAILABLE_PROVIDERS: envVars.SA_AVAILABLE_PROVIDERS?.split(','),
    SA_DISABLED_MODELS: envVars.SA_DISABLED_MODELS?.split(','),
    SA_DEFAULT_MODEL: envVars.SA_DEFAULT_MODEL,
    SA_AGENT_DIRS: envVars.SA_AGENT_DIRS?.split(','),
    SA_SKILL_DIRS: envVars.SA_SKILL_DIRS?.split(','),
  });
};

/**
 * Config をマージする
 * 優先順位: ConfigFile < EnvVars < CliArgs
 */
const mergeConfig = (
  configFile: ConfigFile,
  envVars: Partial<ParsedEnvVars>,
  cliArgs: Partial<CliArgs>,
): Config => {
  const merged = {
    ssaDir: cliArgs['ssa-dir'] ?? envVars.SA_DIR,
    availableProviders:
      cliArgs['available-providers'] ??
      (envVars.SA_AVAILABLE_PROVIDERS !== undefined && envVars.SA_AVAILABLE_PROVIDERS.length > 0
        ? envVars.SA_AVAILABLE_PROVIDERS
        : undefined),
    disabledModels:
      cliArgs['disabled-models'] ??
      (envVars.SA_DISABLED_MODELS !== undefined && envVars.SA_DISABLED_MODELS.length > 0
        ? envVars.SA_DISABLED_MODELS
        : undefined),
    defaultModel: configFile?.defaultModel ?? cliArgs['default-model'] ?? envVars.SA_DEFAULT_MODEL,
    agentsDirs:
      cliArgs['agents-dir'] ??
      (envVars.SA_AGENT_DIRS !== undefined && envVars.SA_AGENT_DIRS.length > 0
        ? envVars.SA_AGENT_DIRS
        : undefined) ??
      configFile.agentDirs ??
      [],
    skillsDirs:
      cliArgs['skills-dir'] ??
      (envVars.SA_SKILL_DIRS !== undefined && envVars.SA_SKILL_DIRS.length > 0
        ? envVars.SA_SKILL_DIRS
        : undefined) ??
      configFile.skillDirs ??
      [],
  };

  return configSchema.parse(merged);
};

/**
 * Context を読み込む
 * Config を読み込み、agents と skills をマージ
 */
export const loadContext = async (options: LoadContextOptions = {}): Promise<Context> => {
  const cliArgs = options.cliArgs ?? {};
  const rawEnvVars = options.envVars ?? {};

  // EnvVars をパース
  const envVars = parseEnvVars(rawEnvVars);

  const configFilePath = resolveConfigPath(cliArgs, envVars);

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
