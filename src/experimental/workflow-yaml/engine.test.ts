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

  it('loop runs until condition is met', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf',
      steps: [
        {
          id: 'loop',
          execute: {
            type: 'loop',
            max: 3,
            until: '${{ steps.inner.stdout == "done" }}',
            steps: [
              {
                id: 'inner',
                execute: { type: 'shell', run: 'inner' },
              },
            ],
          },
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

  it('loop resets child outputs per iteration and preserves order', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf',
      steps: [
        {
          id: 'loop',
          execute: {
            type: 'loop',
            max: 2,
            steps: [
              { id: 'inner1', execute: { type: 'shell', run: 'inner1' } },
              { id: 'inner2', execute: { type: 'shell', run: '${{ steps.inner1.stdout }}' } },
            ],
          },
        },
      ],
    };

    let iteration = 0;
    const inner2Runs: string[] = [];

    const result = await runWorkflow({
      workflow,
      inputs: {},
      options: {
        runners: {
          shell: ({ stepId, run }) => {
            if (stepId === 'inner1') {
              iteration += 1;
              return Promise.resolve({ stdout: `v${iteration}`, stderr: '', exitCode: 0 });
            }
            if (stepId === 'inner2') {
              inner2Runs.push(run);
              return Promise.resolve({ stdout: run, stderr: '', exitCode: 0 });
            }
            return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
          },
        },
      },
    });

    expect(result.status).toBe('success');
    expect(inner2Runs).toEqual(['v1', 'v2']);
    expect(getStep(result, 'inner2').outputs.stdout).toBe('v2');
  });

  it('loop onError retry (final=skip) allows downstream execution after child failure', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf',
      steps: [
        {
          id: 'loop',
          onError: { type: 'retry', max: 1, strategy: 'fixed', seconds: 0, final: 'skip' },
          execute: {
            type: 'loop',
            max: 1,
            steps: [
              {
                id: 'inner',
                execute: { type: 'shell', run: 'inner' },
              },
            ],
          },
        },
        {
          id: 'after',
          needs: ['loop'],
          execute: { type: 'shell', run: 'after' },
        },
      ],
    };

    const executions: string[] = [];
    const result = await runWorkflow({
      workflow,
      inputs: {},
      options: {
        runners: {
          shell: ({ stepId }) => {
            executions.push(stepId);
            return Promise.resolve({
              stdout: '',
              stderr: 'error',
              exitCode: stepId === 'inner' ? 1 : 0,
            });
          },
        },
        clock: {
          now: () => 0,
          sleep: async () => {},
        },
      },
    });

    expect(result.status).toBe('success');
    expect(getStep(result, 'loop').attempts).toBe(2);
    expect(getStep(result, 'loop').status).toBe('skipped');
    expect(getStep(result, 'after').status).toBe('success');

    const loopExecutions = (result.executions ?? []).filter((record) => record.stepId === 'loop');
    expect(loopExecutions).toHaveLength(2);
    expect(loopExecutions.every((record) => record.status === 'failed')).toBe(true);
    expect(executions).toEqual(['inner', 'inner', 'after']);
  });

  it('loop until evaluation error finalizes status per onError', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf',
      steps: [
        {
          id: 'loop',
          onError: { type: 'skip' },
          execute: {
            type: 'loop',
            max: 1,
            until: '${{ steps.inner.stdout == }}',
            steps: [
              {
                id: 'inner',
                execute: { type: 'shell', run: 'inner' },
              },
            ],
          },
        },
        {
          id: 'after',
          needs: ['loop'],
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
            exitCode: 0,
            stdout: stepId,
          })),
        },
      },
    });

    expect(result.status).toBe('success');
    expect(getStep(result, 'loop').status).toBe('skipped');
    expect(getStep(result, 'after').status).toBe('success');
  });

  it('legacy repeat input is normalized and runs', async () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps:
  - id: loop
    repeat:
      max: 3
      until: \${{ steps.inner.stdout == "done" }}
    steps:
      - id: inner
        execute:
          type: shell
          run: inner
`);

    let count = 0;
    const result = await runWorkflow({
      workflow,
      inputs: {},
      options: {
        runners: {
          shell: ({ stepId }) => {
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

  it('legacy repeat.steps input is normalized and runs', async () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps:
  - id: loop
    repeat:
      max: 3
      until: \${{ steps.inner.stdout == "done" }}
      steps:
        - id: inner
          execute:
            type: shell
            run: inner
`);

    let count = 0;
    const result = await runWorkflow({
      workflow,
      inputs: {},
      options: {
        runners: {
          shell: ({ stepId }) => {
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

  it('clears step error after retry succeeds', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf',
      steps: [
        {
          id: 'flaky',
          onError: { type: 'retry', max: 1, strategy: 'fixed', seconds: 0 },
          execute: { type: 'shell', run: 'flaky' },
        },
      ],
    };

    const result = await runWorkflow({
      workflow,
      inputs: {},
      options: {
        runners: {
          shell: createShellRunner((stepId, attempt) => ({
            exitCode: stepId === 'flaky' && attempt === 1 ? 1 : 0,
          })),
        },
        clock: {
          now: () => 0,
          sleep: async () => {},
        },
      },
    });

    expect(result.status).toBe('success');
    expect(getStep(result, 'flaky').status).toBe('success');
    expect(getStep(result, 'flaky').error).toBeUndefined();
  });

  it('clears loop step error after onError retry succeeds', async () => {
    const workflow: WorkflowDefinition = {
      id: 'wf',
      steps: [
        {
          id: 'loop',
          onError: { type: 'retry', max: 1, strategy: 'fixed', seconds: 0 },
          execute: {
            type: 'loop',
            max: 1,
            steps: [{ id: 'inner', execute: { type: 'shell', run: 'inner' } }],
          },
        },
        {
          id: 'after',
          needs: ['loop'],
          execute: { type: 'shell', run: 'after' },
        },
      ],
    };

    let innerCalls = 0;
    const result = await runWorkflow({
      workflow,
      inputs: {},
      options: {
        runners: {
          shell: ({ stepId }) => {
            if (stepId === 'inner') {
              innerCalls += 1;
              return Promise.resolve({
                stdout: '',
                stderr: innerCalls === 1 ? 'error' : '',
                exitCode: innerCalls === 1 ? 1 : 0,
              });
            }
            return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
          },
        },
        clock: {
          now: () => 0,
          sleep: async () => {},
        },
      },
    });

    expect(result.status).toBe('success');
    expect(getStep(result, 'loop').status).toBe('success');
    expect(getStep(result, 'loop').error).toBeUndefined();
    expect(getStep(result, 'after').status).toBe('success');
    expect(innerCalls).toBe(2);
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
