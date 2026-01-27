import { describe, expect, it } from 'vitest';
import { runWorkflow } from './engine';
import { loadWorkflowFromYaml } from './loader';
import { type WorkflowDefinition } from './types';

const createShellRunner =
  (behavior: (stepId: string, attempt: number) => { exitCode: number; stdout?: string }) =>
  ({ stepId, attempt }: { stepId: string; attempt: number }) => {
    const result = behavior(stepId, attempt);
    return Promise.resolve({
      stdout: result.stdout ?? '',
      stderr: result.exitCode === 0 ? '' : 'error',
      exitCode: result.exitCode,
    });
  };

describe('runWorkflow', () => {
  const getStep = (result: Awaited<ReturnType<typeof runWorkflow>>, id: string) => {
    const step = result.steps[id];
    if (!step) {
      throw new Error(`Missing step: ${id}`);
    }
    return step;
  };

  it('inherits needs from skipped parents', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf',
      steps: [
        {
          id: 'prep',
          execute: { type: 'shell', run: 'prep' },
        },
        {
          id: 'maybe_skip',
          needs: ['prep'],
          if: '${{ inputs.run == true }}',
          execute: { type: 'shell', run: 'skip' },
        },
        {
          id: 'downstream',
          needs: ['maybe_skip'],
          execute: { type: 'shell', run: 'down' },
        },
      ],
      inputs: {
        run: { type: 'boolean', default: false },
      },
    };

    const callOrder: string[] = [];
    const result = await runWorkflow({
      workflow,
      inputs: { run: false },
      options: {
        runners: {
          shell: async ({ stepId, attempt }) => {
            callOrder.push(stepId);
            return createShellRunner(() => ({ exitCode: 0, stdout: stepId }))({ stepId, attempt });
          },
        },
      },
    });

    expect(result.status).toBe('success');
    expect(getStep(result, 'maybe_skip').status).toBe('skipped');
    expect(getStep(result, 'downstream').status).toBe('success');
    expect(callOrder).toEqual(['prep', 'downstream']);
  });

  it('repeat runs until condition is met', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf',
      steps: [
        {
          id: 'loop',
          repeat: {
            max: 3,
            until: '${{ steps.inner.stdout == "done" }}',
          },
          steps: [
            {
              id: 'inner',
              execute: { type: 'shell', run: 'inner' },
            },
          ],
        },
      ],
    };

    let count = 0;
    const result = await runWorkflow({
      workflow,
      inputs: {},
      options: {
        runners: {
          shell: ({ stepId, attempt: _attempt }) => {
            if (stepId === 'inner') {
              count += 1;
              return Promise.resolve({
                stdout: count >= 2 ? 'done' : 'no',
                stderr: '',
                exitCode: 0,
              });
            }
            return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
          },
        },
      },
    });

    expect(result.status).toBe('success');
    expect(count).toBe(2);
    expect(getStep(result, 'inner').outputs.stdout).toBe('done');
  });

  it('onError retry (final=skip) allows downstream execution after retries', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf',
      steps: [
        {
          id: 'flaky',
          onError: { type: 'retry', max: 1, strategy: 'fixed', seconds: 0, final: 'skip' },
          execute: { type: 'shell', run: 'fail' },
        },
        {
          id: 'after',
          needs: ['flaky'],
          execute: { type: 'shell', run: 'after' },
        },
      ],
    };

    const result = await runWorkflow({
      workflow,
      inputs: {},
      options: {
        runners: {
          shell: createShellRunner((stepId) => ({
            exitCode: stepId === 'flaky' ? 1 : 0,
            stdout: stepId,
          })),
        },
        clock: {
          now: () => 0,
          sleep: async () => {},
        },
      },
    });

    expect(getStep(result, 'flaky').status).toBe('skipped');
    expect(getStep(result, 'after').status).toBe('success');
  });

  it('retries max=2 means 2 retries (3 attempts total)', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf',
      steps: [
        {
          id: 'flaky',
          onError: { type: 'retry', max: 2, strategy: 'fixed', seconds: 0 },
          execute: { type: 'shell', run: 'fail' },
        },
      ],
    };

    let calls = 0;
    const result = await runWorkflow({
      workflow,
      inputs: {},
      options: {
        runners: {
          shell: () => {
            calls += 1;
            return Promise.resolve({ stdout: '', stderr: 'error', exitCode: 1 });
          },
        },
        clock: {
          now: () => 0,
          sleep: async () => {},
        },
      },
    });

    expect(result.status).toBe('failed');
    expect(getStep(result, 'flaky').attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it('legacy onError=skip + retry normalizes to final=skip and continues downstream', async () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps:
  - id: flaky
    onError: skip
    retry:
      max: 1
      strategy: fixed
      seconds: 0
    execute:
      type: shell
      run: fail
  - id: after
    needs: [flaky]
    execute:
      type: shell
      run: after
`);

    const result = await runWorkflow({
      workflow,
      inputs: {},
      options: {
        runners: {
          shell: createShellRunner((stepId) => ({
            exitCode: stepId === 'flaky' ? 1 : 0,
            stdout: stepId,
          })),
        },
        clock: {
          now: () => 0,
          sleep: async () => {},
        },
      },
    });

    expect(getStep(result, 'flaky').status).toBe('skipped');
    expect(getStep(result, 'after').status).toBe('success');
  });

  it('emits logs via onLog', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf',
      steps: [
        {
          id: 'hello',
          execute: { type: 'shell', run: 'echo hello' },
        },
      ],
    };

    const messages: string[] = [];
    const result = await runWorkflow({
      workflow,
      inputs: {},
      options: {
        runners: {
          shell: () => Promise.resolve({ stdout: 'hello', stderr: '', exitCode: 0 }),
        },
        onLog: (entry) => {
          messages.push(`${entry.stepId}:${entry.message}`);
        },
      },
    });

    expect(result.status).toBe('success');
    expect(messages.some((msg) => msg.includes('success'))).toBe(true);
  });
});
