import type { z } from 'zod';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { readMarkdownFile } from './readMarkdownFile';

/**
 * Load all configurations from a directory
 */
export const loadFromDirectory = async <T>(
  dirPath: string,
  schema: z.ZodType<T>,
  entityName: string,
): Promise<T[]> => {
  if (!existsSync(dirPath)) {
    return [];
  }

  const dirStat = await stat(dirPath);
  if (!dirStat.isDirectory()) {
    return [];
  }

  const files = await readdir(dirPath);
  const markdownFiles = files.filter((file) => file.endsWith('.md'));

  // Load all markdown files in parallel
  const results = await Promise.allSettled(
    markdownFiles.map((file) => readMarkdownFile(dirPath, file, schema, entityName)),
  );

  // Extract successful results and filter out nulls
  const fulfilled = results.filter(
    (result): result is PromiseFulfilledResult<Awaited<T> | null> => result.status === 'fulfilled',
  );
  const values = fulfilled.map((result) => result.value);
  return values.filter((item): item is Awaited<T> => item !== null);
};
