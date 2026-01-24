import type { z } from 'zod';
import matter from 'gray-matter';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const readMarkdownWithSchema = async <T>(
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
      path: filePath,
    });
  } catch (error) {
    process.stderr.write(
      `[Warning] Skipping invalid ${entityName} file ${filePath}: ${String(error)}\n`,
    );
    return null;
  }
};

export const readMarkdownFile = async <T>(
  dirPath: string,
  file: string,
  schema: z.ZodType<T>,
  entityName: string,
): Promise<T | null> => {
  const filePath = join(dirPath, file);
  const fileStat = await stat(filePath);
  return fileStat.isFile() ? readMarkdownWithSchema(filePath, schema, entityName) : null;
};
