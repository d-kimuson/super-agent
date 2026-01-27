import { z } from 'zod';
import { type UpdateTextFileResult } from '../../utils/structuredFile';

const claudeSettingsSchema = z
  .object({
    permissions: z
      .object({
        deny: z.array(z.string()).optional(),
      })
      .catchall(z.unknown())
      .optional(),
  })
  .catchall(z.unknown());

const addUniqueToEnd = (params: {
  current: readonly string[];
  additions: readonly string[];
}): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of params.current) {
    if (seen.has(item)) {
      continue;
    }
    seen.add(item);
    result.push(item);
  }

  for (const item of params.additions) {
    if (seen.has(item)) {
      continue;
    }
    seen.add(item);
    result.push(item);
  }

  return result;
};

const areStringArraysEqual = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
};

export const updateClaudeSettingsJsonText = (params: {
  current: string | undefined;
  denyTools: readonly string[];
}): UpdateTextFileResult & { nextContent?: string } => {
  const base = params.current;
  if (base === undefined) {
    const nextSettings = {
      permissions: {
        deny: addUniqueToEnd({ current: [], additions: params.denyTools }),
      },
    };

    return { code: 'updated', nextContent: JSON.stringify(nextSettings, null, 2) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      code: 'parse-error',
      message: `~/.claude/settings.json の JSON parse に失敗しました: ${message}`,
    };
  }

  const parsedResult = claudeSettingsSchema.safeParse(parsed);
  if (!parsedResult.success) {
    return {
      code: 'parse-error',
      message: `~/.claude/settings.json の形式が不正です: ${parsedResult.error.message}`,
    };
  }

  const currentDeny = parsedResult.data.permissions?.deny ?? [];
  const nextDeny = addUniqueToEnd({ current: currentDeny, additions: params.denyTools });

  if (areStringArraysEqual(currentDeny, nextDeny)) {
    return { code: 'no-change' };
  }

  const currentPermissions = parsedResult.data.permissions ?? {};
  const nextSettings = {
    ...parsedResult.data,
    permissions: {
      ...currentPermissions,
      deny: nextDeny,
    },
  };

  return { code: 'updated', nextContent: JSON.stringify(nextSettings, null, 2) };
};
