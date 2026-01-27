import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { errorToString } from '../../lib/errorToString';
import { type UpdateTextFileResult, readTextFileIfExists, updateTextFile } from './structuredFile';
import {
  formatJson,
  formatToml,
  parseJson,
  parseToml,
  type MergeValueResult,
  type TomlJsonMap,
} from './structuredMerge';

type JsonMergeResult =
  | { code: 'success'; next: unknown; changed: boolean }
  | { code: 'invalid'; message: string };

type TomlMergeResult =
  | { code: 'success'; next: TomlJsonMap; changed: boolean }
  | { code: 'invalid'; message: string };

type ReadTextFileResult = Awaited<ReturnType<typeof readTextFileIfExists>>;

type ReadTextFile = (path: string) => Promise<ReadTextFileResult>;

type WriteTextFileResult = { code: 'success' } | { code: 'io-error'; message: string };

type WriteTextFile = (path: string, content: string) => Promise<WriteTextFileResult>;

type ParseTextResult =
  | { code: 'success'; value: unknown }
  | { code: 'parse-error'; message: string };

const writeFileAtomic = async (path: string, content: string): Promise<WriteTextFileResult> => {
  try {
    const dir = dirname(path);
    await mkdir(dir, { recursive: true });

    const tmpPath = `${path}.tmp.${process.pid}`;
    await writeFile(tmpPath, content, 'utf-8');
    await rename(tmpPath, path);
    return { code: 'success' };
  } catch (error: unknown) {
    return { code: 'io-error', message: errorToString(error) };
  }
};

export const readStructuredFileText = async (params: {
  path: string;
  readTextFile?: ReadTextFile;
}): Promise<ReadTextFileResult> => {
  const readText = params.readTextFile ?? readTextFileIfExists;
  return readText(params.path);
};

export const parseStructuredText = (params: {
  currentText: string | undefined;
  defaultObject: unknown;
  parse: (text: string) => { code: 'success'; value: unknown } | { code: 'error'; message: string };
}): ParseTextResult => {
  if (params.currentText === undefined) {
    return { code: 'success', value: params.defaultObject };
  }

  const parsed = params.parse(params.currentText);
  if (parsed.code !== 'success') {
    return { code: 'parse-error', message: parsed.message };
  }
  return { code: 'success', value: parsed.value };
};

export const mergeStructuredValue = <TValue>(params: {
  currentValue: unknown;
  merge: (current: unknown) => MergeValueResult<TValue>;
}): MergeValueResult<TValue> => params.merge(params.currentValue);

export const writeStructuredFileText = async (params: {
  path: string;
  content: string;
  writeTextFile?: WriteTextFile;
}): Promise<WriteTextFileResult> => {
  const writeText = params.writeTextFile ?? writeFileAtomic;
  return writeText(params.path, params.content);
};

export const updateStructuredFileValue = async <TValue>(params: {
  path: string;
  defaultObject: unknown;
  parse: (text: string) => { code: 'success'; value: unknown } | { code: 'error'; message: string };
  format: (value: TValue) => string;
  merge: (current: unknown) => MergeValueResult<TValue>;
  readTextFile?: ReadTextFile;
  writeTextFile?: WriteTextFile;
}): Promise<UpdateTextFileResult> => {
  const readResult = await readStructuredFileText({
    path: params.path,
    readTextFile: params.readTextFile,
  });
  if (readResult.code !== 'success') {
    return readResult;
  }

  const currentText = readResult.exists ? readResult.content : undefined;
  const parsed = parseStructuredText({
    currentText,
    defaultObject: params.defaultObject,
    parse: params.parse,
  });
  if (parsed.code !== 'success') {
    return parsed;
  }

  const merged = mergeStructuredValue({ currentValue: parsed.value, merge: params.merge });
  if (merged.code !== 'success') {
    return { code: 'parse-error', message: merged.message };
  }

  const nextContent = params.format(merged.value);
  if (currentText !== undefined && currentText === nextContent) {
    return { code: 'no-change' };
  }

  const writeResult = await writeStructuredFileText({
    path: params.path,
    content: nextContent,
    writeTextFile: params.writeTextFile,
  });
  if (writeResult.code !== 'success') {
    return writeResult;
  }

  return { code: 'updated' };
};

export const updateJsonFileValue = async (params: {
  path: string;
  defaultObject: unknown;
  merge: (current: unknown) => MergeValueResult<unknown>;
  readTextFile?: ReadTextFile;
  writeTextFile?: WriteTextFile;
}): Promise<UpdateTextFileResult> => {
  return updateStructuredFileValue({
    path: params.path,
    defaultObject: params.defaultObject,
    parse: parseJson,
    format: formatJson,
    merge: params.merge,
    readTextFile: params.readTextFile,
    writeTextFile: params.writeTextFile,
  });
};

export const updateTomlFileValue = async (params: {
  path: string;
  defaultObject: unknown;
  merge: (current: unknown) => MergeValueResult<TomlJsonMap>;
  readTextFile?: ReadTextFile;
  writeTextFile?: WriteTextFile;
}): Promise<UpdateTextFileResult> => {
  return updateStructuredFileValue({
    path: params.path,
    defaultObject: params.defaultObject,
    parse: parseToml,
    format: formatToml,
    merge: params.merge,
    readTextFile: params.readTextFile,
    writeTextFile: params.writeTextFile,
  });
};

export const updateJsonFile = async (params: {
  path: string;
  defaultObject: unknown;
  merge: (current: unknown) => JsonMergeResult;
}): Promise<UpdateTextFileResult> => {
  return updateTextFile({
    path: params.path,
    format: (text) => text,
    update: (currentText) => {
      if (currentText === undefined) {
        const merged = params.merge(params.defaultObject);
        if (merged.code !== 'success') {
          return { code: 'parse-error', message: merged.message };
        }
        if (!merged.changed) {
          return { code: 'no-change' };
        }
        return { code: 'updated', nextContent: formatJson(merged.next) };
      }

      const parsedResult = parseJson(currentText);
      if (parsedResult.code !== 'success') {
        return { code: 'parse-error', message: parsedResult.message };
      }

      const merged = params.merge(parsedResult.value);
      if (merged.code !== 'success') {
        return { code: 'parse-error', message: merged.message };
      }
      if (!merged.changed) {
        return { code: 'no-change' };
      }

      return { code: 'updated', nextContent: formatJson(merged.next) };
    },
  });
};

export const updateTomlFile = async (params: {
  path: string;
  defaultObject: TomlJsonMap;
  merge: (current: TomlJsonMap) => TomlMergeResult;
}): Promise<UpdateTextFileResult> => {
  return updateTextFile({
    path: params.path,
    format: (text) => text,
    update: (currentText) => {
      if (currentText === undefined) {
        const merged = params.merge(params.defaultObject);
        if (merged.code !== 'success') {
          return { code: 'parse-error', message: merged.message };
        }
        if (!merged.changed) {
          return { code: 'no-change' };
        }
        return { code: 'updated', nextContent: formatToml(merged.next) };
      }

      const parsedResult = parseToml(currentText);
      if (parsedResult.code !== 'success') {
        return { code: 'parse-error', message: parsedResult.message };
      }

      const merged = params.merge(parsedResult.value);
      if (merged.code !== 'success') {
        return { code: 'parse-error', message: merged.message };
      }
      if (!merged.changed) {
        return { code: 'no-change' };
      }

      return { code: 'updated', nextContent: formatToml(merged.next) };
    },
  });
};
