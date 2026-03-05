import { type AgentConfig, type Config, type SkillConfig } from './schema';

export type CliContext = {
  config: Config;
  agents: AgentConfig[];
  skills: SkillConfig[];
};
