import { spawn } from 'node:child_process';
import { errorToString } from '../../lib/errorToString';

export type RunCommandResult =
  | { code: 'success' }
  | { code: 'spawn-error'; message: string }
  | { code: 'failed'; exitCode: number };

export const runCommand = async (params: {
  command: string;
  args: readonly string[];
  inheritStdio?: boolean;
}): Promise<RunCommandResult> => {
  try {
    const child = spawn(params.command, [...params.args], {
      stdio: params.inheritStdio === false ? 'pipe' : 'inherit',
    });

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('close', (code) => resolve(code));
    });

    if (exitCode === 0) {
      return { code: 'success' };
    }
    if (exitCode === null) {
      return { code: 'failed', exitCode: 1 };
    }
    return { code: 'failed', exitCode };
  } catch (error: unknown) {
    return { code: 'spawn-error', message: errorToString(error) };
  }
};
