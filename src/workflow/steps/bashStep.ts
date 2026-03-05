import { spawn } from 'node:child_process';

export const bashStep = async (
  command: string,
  options?: { cwd?: string; args?: string[] },
): Promise<
  | {
      status: 'success';
      stdout: string;
      stderr?: string;
    }
  | {
      status: 'failed';
      reason: 'timeout' | 'process_exit' | 'runtime_error';
      stdout?: string;
      stderr: string;
    }
> => {
  const args = options?.args ?? [];
  const fullCommand = [command, ...args].join(' ');

  return new Promise((resolve) => {
    const proc = spawn(fullCommand, {
      cwd: options?.cwd,
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (exitCode: number | null) => {
      if (exitCode === 0 || exitCode === null) {
        resolve({
          status: 'success',
          stdout: stdout.trimEnd(),
          stderr: stderr || undefined,
        });
      } else {
        resolve({
          status: 'failed',
          reason: 'process_exit',
          stdout: stdout || undefined,
          stderr: stderr || `Process exited with code ${String(exitCode)}`,
        });
      }
    });

    proc.on('error', (error: Error) => {
      resolve({
        status: 'failed',
        reason: 'runtime_error',
        stdout: stdout || undefined,
        stderr: error.message,
      });
    });
  });
};
