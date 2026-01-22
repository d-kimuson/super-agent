import type { z } from 'zod';
import matter from 'gray-matter';
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  agentConfigSchema,
  configFileSchema,
  skillConfigSchema,
  type AgentConfig,
  type ConfigFile,
  type SkillConfig,
} from './schema';
import { type Config } from './types';

export type LoadConfigOptions = {
  configPath?: string;
  agentDirs: string[];
  skillDirs: string[];
};

/**
 * Load markdown file with frontmatter and validate against schema
 */
const loadMarkdownWithSchema = async <T>(
  filePath: string,
  schema: z.ZodType<T>,
  entityName: string,
): Promise<T | null> => {
  try {
    const content = await readFile(filePath, 'utf-8');
    const { data, content: prompt } = matter(content);

    return schema.parse({
      ...data,
      prompt: prompt.trim() || undefined,
    });
  } catch (error) {
    process.stderr.write(
      `[Warning] Skipping invalid ${entityName} file ${filePath}: ${String(error)}\n`,
    );
    return null;
  }
};

/**
 * Load markdown file if it's a valid file
 */
const loadMarkdownFile = async <T>(
  dirPath: string,
  file: string,
  schema: z.ZodType<T>,
  entityName: string,
): Promise<T | null> => {
  const filePath = join(dirPath, file);
  const fileStat = await stat(filePath);
  return fileStat.isFile() ? loadMarkdownWithSchema(filePath, schema, entityName) : null;
};

/**
 * Load all configurations from a directory
 */
const loadFromDirectory = async <T>(
  dirPath: string,
  schema: z.ZodType<T>,
  entityName: string,
): Promise<T[]> => {
  if (!existsSync(dirPath)) {
    process.stderr.write(`[Warning] ${entityName} directory not found: ${dirPath}\n`);
    return [];
  }

  const dirStat = await stat(dirPath);
  if (!dirStat.isDirectory()) {
    process.stderr.write(`[Warning] Not a directory: ${dirPath}\n`);
    return [];
  }

  const files = await readdir(dirPath);
  const markdownFiles = files.filter((file) => file.endsWith('.md'));

  // Load all markdown files in parallel
  const results = await Promise.allSettled(
    markdownFiles.map((file) => loadMarkdownFile(dirPath, file, schema, entityName)),
  );

  // Extract successful results and filter out nulls
  const fulfilled = results.filter(
    (result): result is PromiseFulfilledResult<Awaited<T> | null> => result.status === 'fulfilled',
  );
  const values = fulfilled.map((result) => result.value);
  return values.filter((item): item is Awaited<T> => item !== null);
};

/**
 * Load all agent configurations from a directory
 */
const loadAgentsFromDirectory = async (dirPath: string): Promise<AgentConfig[]> => {
  return loadFromDirectory(dirPath, agentConfigSchema, 'Agent');
};

/**
 * Load all skill configurations from a directory
 */
const loadSkillsFromDirectory = async (dirPath: string): Promise<SkillConfig[]> => {
  return loadFromDirectory(dirPath, skillConfigSchema, 'Skill');
};

/**
 * Load config file (optional)
 */
const loadConfigFile = async (configPath?: string): Promise<ConfigFile> => {
  if (configPath === undefined || configPath === '' || !existsSync(configPath)) {
    return configFileSchema.parse({});
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    const json: unknown = JSON.parse(content);
    return configFileSchema.parse(json);
  } catch (error) {
    process.stderr.write(`[Warning] Invalid config file ${configPath}: ${String(error)}\n`);
    return configFileSchema.parse({});
  }
};

/**
 * Load configuration from agent/skill directories and optional config file
 */
export const loadConfig = async (options: LoadConfigOptions): Promise<Config> => {
  const configFile = await loadConfigFile(options.configPath);

  const [agentResults, skillResults] = await Promise.all([
    Promise.allSettled(
      [...options.agentDirs, ...configFile.agentDirs].map(loadAgentsFromDirectory),
    ),
    Promise.allSettled(
      [...options.skillDirs, ...configFile.skillDirs].map(loadSkillsFromDirectory),
    ),
  ]);

  // Flatten all successfully loaded agents
  const agents = agentResults
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value);

  // Flatten all successfully loaded skills
  const skills = skillResults
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value);

  return {
    ...configFile,
    agents,
    skills,
  };
};
