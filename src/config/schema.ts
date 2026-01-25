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
  defaultModel: configRestrictions.defaultModelObject.optional(),
  agentDirs: configRestrictions.agentDirs.optional(),
  skillDirs: configRestrictions.skillDirs.optional(),
});

export const envVarsSchema = z.object({
  SSA_DIR: configRestrictions.ssaDir.optional(),
  SSA_AVAILABLE_PROVIDERS: z
    .string()
    .optional()
    .transform((value) => value?.split(',') ?? []),
  SSA_DISABLED_MODELS: z
    .string()
    .optional()
    .transform((value) => value?.split(',') ?? []),
  SSA_DEFAULT_MODEL: configRestrictions.defaultModelText.optional(),
  SSA_AGENT_DIRS: z
    .string()
    .optional()
    .transform((value) => value?.split(',') ?? []),
  SSA_SKILL_DIRS: z
    .string()
    .optional()
    .transform((value) => value?.split(',') ?? []),
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
  ssaDir: configRestrictions.ssaDir.optional().default(resolve(homedir(), '.super-subagents')),
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
export type CliArgs = z.infer<typeof cliArgsSchema>;

/**
 * CliArgs + EnvVars + ConfigFile => Config
 * priority: ConfigFile < EnvVars < CliArgs
 */
export type Config = z.infer<typeof configSchema>;
