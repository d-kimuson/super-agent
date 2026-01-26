import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { z } from 'zod';

export const providersSchema = z.enum(['claude', 'codex', 'copilot', 'gemini']);

export const agentModelSchema = z.object({
  sdkType: providersSchema,
  model: z.string().optional(),
});

export const agentConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  prompt: z.string(),
  models: z.array(agentModelSchema).optional().default([]),
  skills: z.array(z.string()).optional().default([]),
});

export const skillConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  prompt: z.string(),
  path: z.string(),
});

/**
 * Default model format: "provider:model" (e.g., "claude:sonnet") or "provider" (e.g., "claude")
 */
const parseDefaultModel = (value: string): z.infer<typeof agentModelSchema> => {
  const [sdkType, model] = value.split(':');
  return agentModelSchema.parse({
    sdkType,
    model: model ?? undefined,
  });
};

const configRestrictions = {
  ssaDir: z.string(),
  availableProviders: z.array(providersSchema),
  disabledModels: z.array(z.string()),
  defaultModelText: z.string().transform(parseDefaultModel),
  defaultModelObject: z.object({
    sdkType: providersSchema,
    model: z.string().optional(),
  }),
  agentDirs: z.array(z.string()),
  skillDirs: z.array(z.string()),
} as const;

export const configFileSchema = z.object({
  availableProviders: configRestrictions.availableProviders.optional(),
  disabledModels: configRestrictions.disabledModels.optional(),
  defaultModel: configRestrictions.defaultModelObject.optional(),
  agentDirs: configRestrictions.agentDirs.optional(),
  skillDirs: configRestrictions.skillDirs.optional(),
});

export const envVarsSchema = z.object({
  SA_DIR: configRestrictions.ssaDir.optional(),
  SA_AVAILABLE_PROVIDERS: z.string().optional(),
  SA_DISABLED_MODELS: z.string().optional(),
  SA_DEFAULT_MODEL: z.string().optional(),
  SA_AGENT_DIRS: z.string().optional(),
  SA_SKILL_DIRS: z.string().optional(),
});

/**
 * EnvVars after parsing and transformation
 */
export const parsedEnvVarsSchema = z.object({
  SA_DIR: configRestrictions.ssaDir.optional(),
  SA_AVAILABLE_PROVIDERS: configRestrictions.availableProviders.optional(),
  SA_DISABLED_MODELS: configRestrictions.disabledModels.optional(),
  SA_DEFAULT_MODEL: configRestrictions.defaultModelText.optional(),
  SA_AGENT_DIRS: configRestrictions.agentDirs.optional(),
  SA_SKILL_DIRS: configRestrictions.skillDirs.optional(),
});

export const cliArgsSchema = z.object({
  'ssa-dir': configRestrictions.ssaDir.optional(),
  'available-providers': configRestrictions.availableProviders.optional(),
  'disabled-models': configRestrictions.disabledModels.optional(),
  'default-model': configRestrictions.defaultModelText.optional(),
  'agents-dir': configRestrictions.agentDirs.optional(),
  'skills-dir': configRestrictions.skillDirs.optional(),
});

export const configSchema = z.object({
  ssaDir: configRestrictions.ssaDir.optional().default(resolve(homedir(), '.super-agent')),
  availableProviders: configRestrictions.availableProviders
    .optional()
    .default(['claude', 'codex', 'copilot', 'gemini']),
  disabledModels: configRestrictions.disabledModels.optional().default([]),
  defaultModel: agentModelSchema.optional().default({
    sdkType: 'claude',
    model: 'default',
  }),
  agentsDirs: configRestrictions.agentDirs.optional().default([]),
  skillsDirs: configRestrictions.skillDirs.optional().default([]),
});

export type AgentModel = z.infer<typeof agentModelSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type SkillConfig = z.infer<typeof skillConfigSchema>;
export type ConfigFile = z.infer<typeof configFileSchema>;
export type EnvVars = z.infer<typeof envVarsSchema>;
export type ParsedEnvVars = z.infer<typeof parsedEnvVarsSchema>;
export type CliArgs = z.infer<typeof cliArgsSchema>;

/**
 * CliArgs + EnvVars + ConfigFile => Config
 * priority: ConfigFile < EnvVars < CliArgs
 */
export type Config = z.infer<typeof configSchema>;
