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
import { type CliContext } from './types';

export type LoadContextOptions = {
  cliArgs?: Partial<CliArgs>;
  envVars?: Partial<EnvVars>;
};

/**
 * Config file path を解決する
 * 優先順位: CliArgs > EnvVars > default
 */
const resolveConfigPath = (cliArgs: Partial<CliArgs>, envVars: Partial<ParsedEnvVars>): string => {
  const ssaDir = cliArgs['sa-dir'] ?? envVars.SA_DIR ?? resolve(homedir(), '.super-agent');
  return resolve(ssaDir, 'config.json');
};

const resolveLocalConfigPath = (
  cliArgs: Partial<CliArgs>,
  envVars: Partial<ParsedEnvVars>,
): string => {
  const ssaDir = cliArgs['sa-dir'] ?? envVars.SA_DIR ?? resolve(homedir(), '.super-agent');
  return resolve(ssaDir, 'config.local.json');
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
 * 優先順位: ConfigFile < LocalConfig < EnvVars < CliArgs
 */
const mergeConfig = (
  configFile: ConfigFile,
  localConfigFile: ConfigFile,
  envVars: Partial<ParsedEnvVars>,
  cliArgs: Partial<CliArgs>,
): Config => {
  const defaultModel =
    cliArgs['default-model'] ??
    envVars.SA_DEFAULT_MODEL ??
    localConfigFile.defaultModel ??
    configFile.defaultModel;

  const availableProviders =
    cliArgs['available-providers'] ??
    (envVars.SA_AVAILABLE_PROVIDERS !== undefined && envVars.SA_AVAILABLE_PROVIDERS.length > 0
      ? envVars.SA_AVAILABLE_PROVIDERS
      : undefined) ??
    (localConfigFile.availableProviders !== undefined &&
    localConfigFile.availableProviders.length > 0
      ? localConfigFile.availableProviders
      : undefined) ??
    (configFile.availableProviders !== undefined && configFile.availableProviders.length > 0
      ? configFile.availableProviders
      : undefined) ??
    (defaultModel?.sdkType !== undefined ? [defaultModel.sdkType] : undefined);

  const disabledModels =
    cliArgs['disabled-models'] ??
    (envVars.SA_DISABLED_MODELS !== undefined && envVars.SA_DISABLED_MODELS.length > 0
      ? envVars.SA_DISABLED_MODELS
      : undefined) ??
    (localConfigFile.disabledModels !== undefined && localConfigFile.disabledModels.length > 0
      ? localConfigFile.disabledModels
      : undefined) ??
    (configFile.disabledModels !== undefined && configFile.disabledModels.length > 0
      ? configFile.disabledModels
      : undefined);

  const merged = {
    ssaDir: cliArgs['sa-dir'] ?? envVars.SA_DIR,
    availableProviders,
    disabledModels,
    defaultModel,
    agentsDirs:
      cliArgs['agents-dir'] ??
      (envVars.SA_AGENT_DIRS !== undefined && envVars.SA_AGENT_DIRS.length > 0
        ? envVars.SA_AGENT_DIRS
        : undefined) ??
      localConfigFile.agentDirs ??
      configFile.agentDirs ??
      [],
    skillsDirs:
      cliArgs['skills-dir'] ??
      (envVars.SA_SKILL_DIRS !== undefined && envVars.SA_SKILL_DIRS.length > 0
        ? envVars.SA_SKILL_DIRS
        : undefined) ??
      localConfigFile.skillDirs ??
      configFile.skillDirs ??
      [],
  };

  return configSchema.parse(merged);
};

/**
 * Context を読み込む
 * Config を読み込み、agents と skills をマージ
 */
export const loadContext = async (options: LoadContextOptions = {}): Promise<CliContext> => {
  const cliArgs = options.cliArgs ?? {};
  const rawEnvVars = options.envVars ?? {};

  // EnvVars をパース
  const envVars = parseEnvVars(rawEnvVars);

  const configFilePath = resolveConfigPath(cliArgs, envVars);
  const localConfigFilePath = resolveLocalConfigPath(cliArgs, envVars);

  // Config file を読み込み
  const configFile = await loadConfig(configFilePath);
  const localConfigFile = await loadConfig(localConfigFilePath);

  // Config をマージ
  const config = mergeConfig(configFile, localConfigFile, envVars, cliArgs);

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
