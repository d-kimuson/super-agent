import { type UpdateTextFileResult, updateTextFile } from './structuredFile';
import { formatJson, formatToml, parseJson, parseToml, type TomlJsonMap } from './structuredMerge';

type JsonMergeResult =
  | { code: 'success'; next: unknown; changed: boolean }
  | { code: 'invalid'; message: string };

type TomlMergeResult =
  | { code: 'success'; next: TomlJsonMap; changed: boolean }
  | { code: 'invalid'; message: string };

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
