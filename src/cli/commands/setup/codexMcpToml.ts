import { type UpdateTextFileResult } from '../../utils/structuredFile';

const sectionHeader = '[mcp_servers.super-agent]';
const timeoutKey = 'tool_timeout_sec';

const splitLines = (text: string): string[] => {
  const normalized = text.replaceAll('\r\n', '\n');
  if (normalized === '') {
    return [];
  }
  return normalized.split('\n');
};

const joinLines = (lines: readonly string[]): string => lines.join('\n');

const isSectionLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.startsWith('[') && trimmed.endsWith(']');
};

const isTargetSectionHeader = (line: string): boolean => line.trim() === sectionHeader;

const parseTimeoutLine = (
  line: string,
): { matched: false } | { matched: true; currentValueText: string; commentSuffix: string } => {
  const commentIndex = line.indexOf('#');
  const beforeComment = commentIndex === -1 ? line : line.slice(0, commentIndex);
  const commentSuffix = commentIndex === -1 ? '' : line.slice(commentIndex);

  const match = /^\s*tool_timeout_sec\s*=\s*(.*?)\s*$/.exec(beforeComment);
  if (match === null) {
    return { matched: false };
  }

  const currentValueText = match[1] ?? '';
  return { matched: true, currentValueText, commentSuffix };
};

const upsertToolTimeoutInTargetSection = (params: {
  lines: readonly string[];
  timeoutSec: number;
}): { code: 'no-change'; nextLines: string[] } | { code: 'updated'; nextLines: string[] } => {
  const lines = [...params.lines];
  const sectionIndex = lines.findIndex(isTargetSectionHeader);

  if (sectionIndex === -1) {
    const suffix = lines.length > 0 && lines[lines.length - 1] !== '' ? ['', ''] : [''];
    const nextLines = [...lines, ...suffix, sectionHeader, `${timeoutKey} = ${params.timeoutSec}`];
    return { code: 'updated', nextLines };
  }

  let endIndex = lines.length;
  for (let i = sectionIndex + 1; i < lines.length; i += 1) {
    if (isSectionLine(lines[i] ?? '')) {
      endIndex = i;
      break;
    }
  }

  for (let i = sectionIndex + 1; i < endIndex; i += 1) {
    const parsed = parseTimeoutLine(lines[i] ?? '');
    if (!parsed.matched) {
      continue;
    }

    const currentNumber = Number(parsed.currentValueText.trim());
    if (Number.isFinite(currentNumber) && currentNumber === params.timeoutSec) {
      return { code: 'no-change', nextLines: lines };
    }

    const indentMatch = /^(\s*)/.exec(lines[i] ?? '');
    const indent = indentMatch?.[1] ?? '';
    lines[i] = `${indent}${timeoutKey} = ${params.timeoutSec}${parsed.commentSuffix}`;
    return { code: 'updated', nextLines: lines };
  }

  const insertAt = endIndex;
  const nextLines = [
    ...lines.slice(0, insertAt),
    `${timeoutKey} = ${params.timeoutSec}`,
    ...lines.slice(insertAt),
  ];
  return { code: 'updated', nextLines };
};

export const updateCodexMcpTomlText = (params: {
  current: string | undefined;
  timeoutSec: number;
}): UpdateTextFileResult & { nextContent?: string } => {
  const current = params.current;
  const currentText = current ?? '';
  const currentLines = splitLines(currentText);

  const upsertResult = upsertToolTimeoutInTargetSection({
    lines: currentLines,
    timeoutSec: params.timeoutSec,
  });

  if (upsertResult.code === 'no-change') {
    return { code: 'no-change' };
  }

  const nextContent = joinLines(upsertResult.nextLines);
  if (nextContent === currentText) {
    return { code: 'no-change' };
  }

  return { code: 'updated', nextContent };
};
