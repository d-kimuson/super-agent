import { type AgentConfig, agentConfigSchema } from '../schema';
import { loadFromDirectory } from './loadFromDirectory';

export const loadAgentsFromDirectory = async (dirPath: string): Promise<AgentConfig[]> => {
  return loadFromDirectory(dirPath, agentConfigSchema, 'Agent');
};
