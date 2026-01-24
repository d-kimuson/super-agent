import { type AgentConfig, type Config, type SkillConfig } from './schema';

export type Context = {
  config: Config;
  agents: AgentConfig[];
  skills: SkillConfig[];
};
