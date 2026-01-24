import { type SkillConfig, skillConfigSchema } from '../schema';
import { loadFromDirectory } from './loadFromDirectory';

export const loadSkillsFromDirectory = async (dirPath: string): Promise<SkillConfig[]> => {
  return loadFromDirectory(dirPath, skillConfigSchema, 'Skill');
};
