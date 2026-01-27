import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { errorToString } from '../../lib/errorToString';

type ReadTextFileResult =
  | { code: 'success'; exists: true; content: string }
  | { code: 'success'; exists: false }
  | { code: 'io-error'; message: string };

export type UpdateTextFileResult =
  | { code: 'updated' }
  | { code: 'no-change' }
  | { code: 'parse-error'; message: string }
  | { code: 'io-error'; message: string };

export const readTextFileIfExists = async (path: string): Promise<ReadTextFileResult> => {
  try {
    if (!existsSync(path)) {
      return { code: 'success', exists: false };
    }
    const content = await readFile(path, 'utf-8');
    return { code: 'success', exists: true, content };
  } catch (error: unknown) {
    return { code: 'io-error', message: errorToString(error) };
  }
};

const writeFileAtomic = async (path: string, content: string): Promise<void> => {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });

  const tmpPath = `${path}.tmp.${process.pid}`;
  await writeFile(tmpPath, content, 'utf-8');
  await rename(tmpPath, path);
};

export const updateTextFile = async (params: {
  path: string;
  format: (content: string) => string;
  update: (current: string | undefined) => UpdateTextFileResult & { nextContent?: string };
}): Promise<UpdateTextFileResult> => {
  const readResult = await readTextFileIfExists(params.path);
  if (readResult.code !== 'success') {
    return readResult;
  }

  const current = readResult.exists ? readResult.content : undefined;
  const updateResult = params.update(current);
  if (updateResult.code !== 'updated') {
    return updateResult;
  }

  const nextContent = updateResult.nextContent;
  if (nextContent === undefined) {
    return { code: 'io-error', message: 'Internal error: missing nextContent' };
  }

  try {
    await writeFileAtomic(params.path, params.format(nextContent));
    return { code: 'updated' };
  } catch (error: unknown) {
    return { code: 'io-error', message: errorToString(error) };
  }
};
