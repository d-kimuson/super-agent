import { spawn } from 'node:child_process';
import { AgentSdk } from '../agent-sdk/AgentSdk';
import { createControllablePromise } from '../lib/controllablePromise';
import { errorToString } from '../lib/errorToString';
import { type StepRunners } from './types';

const chunkToString = (chunk: unknown) => {
  if (typeof chunk === 'string') {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk).toString();
  }
  return String(chunk);
};

const runShell = async ({
  run,
  cwd,
  timeoutMs,
}: {
  run: string;
  cwd: string;
  timeoutMs?: number;
}) =>
  await (() => {
    const controllable = createControllablePromise<{
      stdout: string;
      stderr: string;
      exitCode: number;
      timedOut?: boolean;
    }>();
    const child = spawn(run, {
      shell: true,
      cwd,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let finished = false;

    child.stdout.on('data', (chunk) => {
      stdout += chunkToString(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunkToString(chunk);
    });

    const timeoutId =
      timeoutMs !== undefined
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            setTimeout(() => child.kill('SIGKILL'), 2000).unref();
          }, timeoutMs)
        : undefined;

    const resolveOnce = (exitCode: number) => {
      if (finished) {
        return;
      }
      finished = true;
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      controllable.resolve({ stdout, stderr, exitCode, timedOut });
    };

    child.once('error', (error) => {
      stderr += errorToString(error);
      resolveOnce(1);
    });

    child.once('close', (code) => {
      resolveOnce(code ?? 1);
    });

    return controllable.promise;
  })();

export const createDefaultRunners = (): StepRunners => {
  const agentSdk = AgentSdk();

  return {
    shell: async ({ run, cwd, timeoutMs }) => await runShell({ run, cwd, timeoutMs }),
    agent: async ({ sdkType, model, prompt, cwd }) => {
      const stopped = await agentSdk.prompt({ sdkType, model, prompt, cwd });
      if (stopped.status === 'paused' && stopped.currentTurn.status === 'completed') {
        return { output: stopped.currentTurn.output };
      }
      if (stopped.status === 'paused' && stopped.currentTurn.status === 'failed') {
        const message = errorToString(stopped.currentTurn.error ?? 'agent failed');
        throw new Error(message);
      }
      if (stopped.status === 'failed') {
        const message = errorToString(stopped.error ?? 'agent failed');
        throw new Error(message);
      }
      throw new Error('agent failed');
    },
    slack: ({ text }) => Promise.resolve({ output: text }),
  };
};
