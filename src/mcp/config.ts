import matter from 'gray-matter';
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { agentConfigSchema, configFileSchema, type AgentConfig, type ConfigFile } from './schema';
import { type Config } from './types';

export type LoadConfigOptions = {
  configPath?: string;
  agentDirs: string[];
};

/**
 * Load agent configuration from a markdown file with frontmatter
 */
const loadAgentFromMarkdown = async (filePath: string): Promise<AgentConfig | null> => {
  try {
    const content = await readFile(filePath, 'utf-8');
    const { data, content: prompt } = matter(content);

    return agentConfigSchema.parse({
      ...data,
      prompt: prompt.trim() || undefined,
    });
  } catch (error) {
    process.stderr.write(`[Warning] Skipping invalid agent file ${filePath}: ${String(error)}\n`);
    return null;
  }
};

/**
 * Load markdown file if it's a valid file
 */
const loadMarkdownFile = async (dirPath: string, file: string): Promise<AgentConfig | null> => {
  const filePath = join(dirPath, file);
  const fileStat = await stat(filePath);
  return fileStat.isFile() ? loadAgentFromMarkdown(filePath) : null;
};

/**
 * Load all agent configurations from a directory
 */
const loadAgentsFromDirectory = async (dirPath: string): Promise<AgentConfig[]> => {
  if (!existsSync(dirPath)) {
    process.stderr.write(`[Warning] Agent directory not found: ${dirPath}\n`);
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
    markdownFiles.map((file) => loadMarkdownFile(dirPath, file)),
  );

  // Extract successful results and filter out nulls
  return results
    .filter((result) => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((agent) => agent !== null);
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
 * Load configuration from agent directories and optional config file
 */
export const loadConfig = async (options: LoadConfigOptions): Promise<Config> => {
  const configFile = await loadConfigFile(options.configPath);
  const agentResults = await Promise.allSettled(
    [...options.agentDirs, ...configFile.agentDirs].map(loadAgentsFromDirectory),
  );

  // Flatten all successfully loaded agents
  const agents = agentResults
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value);

  return {
    ...configFile,
    agents,
  };
};
