import { type AgentConfig, type ConfigFile } from './schema';

export type Config = ConfigFile & {
  agents: AgentConfig[];
};
