import { type AgentConfig, type ConfigFile, type SkillConfig } from './schema';

export type Config = ConfigFile & {
  agents: AgentConfig[];
  skills: SkillConfig[];
};
