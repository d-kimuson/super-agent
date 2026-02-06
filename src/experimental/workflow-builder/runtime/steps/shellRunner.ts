import { spawn } from 'node:child_process';
import { type ShellStepDef, type StepResult } from '../../builder/types';
import { SkipFlag } from '../../flags';
import { type ICtx } from '../../types';

export const shellRunner = async <Ctx extends ICtx>(
  ctx: Ctx,
  def: ShellStepDef<Ctx>,
): Promise<StepResult> => {
  const command = await def.command(ctx);
  if (command instanceof SkipFlag) {
    return {
      status: 'skipped',
    } satisfies StepResult;
  }

  return new Promise((resolve) => {
    const [cmd, ...args] = command;
    if (cmd === undefined || cmd === null || cmd === '') {
      resolve({
        status: 'success',
        output: {
          stdout: '',
          stderr: 'Error: No command provided',
          exitCode: 1,
        },
      });
      return;
    }

    const proc = spawn(cmd, args, {
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
      resolve({
        status: 'success',
        output: {
          stdout,
          stderr,
          exitCode: exitCode ?? 0,
        },
      });
    });

    proc.on('error', (error: Error) => {
      resolve({
        status: 'success',
        output: {
          stdout,
          stderr: stderr + error.message,
          exitCode: 1,
        },
      });
    });
  });
};
