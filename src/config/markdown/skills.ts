import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { type SkillConfig, skillConfigSchema } from '../schema';
import { readMarkdownFile } from './readMarkdownFile';

/**
 * Load skills from directory structure: <skill-name>/SKILL.md
 */
export const loadSkillsFromDirectory = async (dirPath: string): Promise<SkillConfig[]> => {
  if (!existsSync(dirPath)) {
    return [];
  }

  const dirStat = await stat(dirPath);
  if (!dirStat.isDirectory()) {
    return [];
  }

  const entries = await readdir(dirPath);

  // Find all subdirectories that contain SKILL.md
  const skillDirs: string[] = [];
  for (const entry of entries) {
    const entryPath = join(dirPath, entry);
    const entryStat = await stat(entryPath);
    if (entryStat.isDirectory()) {
      const skillFilePath = join(entryPath, 'SKILL.md');
      if (existsSync(skillFilePath)) {
        skillDirs.push(entry);
      }
    }
  }

  // Load all SKILL.md files in parallel
  const results = await Promise.allSettled(
    skillDirs.map((skillDir) =>
      readMarkdownFile(join(dirPath, skillDir), 'SKILL.md', skillConfigSchema, 'Skill'),
    ),
  );

  // Extract successful results and filter out nulls
  const fulfilled = results.filter(
    (result): result is PromiseFulfilledResult<Awaited<SkillConfig> | null> =>
      result.status === 'fulfilled',
  );
  const values = fulfilled.map((result) => result.value);
  return values.filter((item): item is Awaited<SkillConfig> => item !== null);
};
