import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { type ConfigFile, configFileSchema } from './schema';

/**
 * Config file を読み込む
 */
export const loadConfig = async (configFilePath?: string): Promise<ConfigFile> => {
  if (configFilePath === undefined || configFilePath === '' || !existsSync(configFilePath)) {
    return configFileSchema.parse({});
  }

  try {
    const content = await readFile(configFilePath, 'utf-8');
    const json: unknown = JSON.parse(content);
    return configFileSchema.parse(json);
  } catch (error) {
    process.stderr.write(`[Warning] Invalid config file ${configFilePath}: ${String(error)}\n`);
    return configFileSchema.parse({});
  }
};
