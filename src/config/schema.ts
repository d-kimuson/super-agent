import { z } from 'zod';

export const agentConfigItemSchema = z.object({
  sdkType: z.enum(['claude', 'codex', 'copilot', 'gemini']),
  model: z.string().optional(),
});

export const agentConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  prompt: z.string(),
  agents: z.array(agentConfigItemSchema).optional().default([]),
  skills: z.array(z.string()).optional().default([]),
});

export const skillConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  prompt: z.string(),
  path: z.string(),
});

export const configFileSchema = z.object({
  agentDirs: z.array(z.string()).optional().default([]),
  skillDirs: z.array(z.string()).optional().default([]),
});

export type AgentConfigItem = z.infer<typeof agentConfigItemSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type SkillConfig = z.infer<typeof skillConfigSchema>;
export type ConfigFile = z.infer<typeof configFileSchema>;
