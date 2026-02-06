import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { loadWorkflowFromYaml } from './loader';

const getZodError = (fn: () => unknown): ZodError => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ZodError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected ZodError to be thrown');
};

describe('loadWorkflowFromYaml onError', () => {
  it('accepts onError: {type: fail}', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    onError:
      type: fail
    execute:
      type: shell
      run: echo ok
`);

    expect(workflow.steps[0]?.onError).toEqual({ type: 'fail' });
  });

  it('accepts onError: {type: retry, max: 2}', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    onError:
      type: retry
      max: 2
    execute:
      type: shell
      run: echo ok
`);

    expect(workflow.steps[0]?.onError).toEqual({ type: 'retry', max: 2 });
  });

  it('rejects max/strategy/seconds/final when type !== retry', () => {
    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    onError:
      type: skip
      max: 2
    execute:
      type: shell
      run: echo ok
`),
    ).toThrow();
  });

  it('rejects onError: {type: retry} without max', () => {
    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    onError:
      type: retry
    execute:
      type: shell
      run: echo ok
`),
    ).toThrow();
  });

  it('normalizes legacy onError: skip + retry into onError retry with final skip', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    onError: skip
    retry:
      max: 1
    execute:
      type: shell
      run: echo ok
`);

    expect(workflow.steps[0]?.onError).toEqual({ type: 'retry', max: 1, final: 'skip' });
  });

  it('rejects specifying onError object and legacy retry together', () => {
    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    onError:
      type: retry
      max: 1
    retry:
      max: 1
    execute:
      type: shell
      run: echo ok
`),
    ).toThrow();
  });
});

describe('loadWorkflowFromYaml loop', () => {
  it('parses execute.type=loop with nested execute.steps', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps:
  - id: loop
    execute:
      type: loop
      max: 2
      until: \${{ steps.inner.stdout == "done" }}
      steps:
        - id: inner
          execute:
            type: shell
            run: echo ok
`);

    const step = workflow.steps[0];
    if (!step) {
      throw new Error('Missing step');
    }
    expect(step.execute.type).toBe('loop');
    if (step.execute.type !== 'loop') {
      throw new Error('Expected loop execute');
    }
    expect(step.execute.steps[0]?.id).toBe('inner');
  });

  it('rejects execute.type=loop without execute.steps', () => {
    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: loop
    execute:
      type: loop
      max: 2
`),
    ).toThrow();
  });

  it('rejects loop max when not a positive integer', () => {
    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: loop
    execute:
      type: loop
      max: 0
      steps: []
`),
    ).toThrow();

    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: loop
    execute:
      type: loop
      max: 1.5
      steps: []
`),
    ).toThrow();
  });

  it('rejects execute.steps when execute.type is not loop', () => {
    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    execute:
      type: shell
      run: echo ok
      steps: []
`),
    ).toThrow();
  });

  it('normalizes legacy repeat into execute.type=loop', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps:
  - id: loop
    repeat:
      max: 2
    steps:
      - id: inner
        execute:
          type: shell
          run: echo ok
`);

    const step = workflow.steps[0];
    if (!step) {
      throw new Error('Missing step');
    }
    expect(step.execute.type).toBe('loop');
    if (step.execute.type !== 'loop') {
      throw new Error('Expected loop execute');
    }
    expect(step.execute.steps[0]?.id).toBe('inner');
  });

  it('normalizes legacy repeat.steps into execute.type=loop', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps:
  - id: loop
    repeat:
      max: 2
      steps:
        - id: inner
          execute:
            type: shell
            run: echo ok
`);

    const step = workflow.steps[0];
    if (!step) {
      throw new Error('Missing step');
    }
    expect(step.execute.type).toBe('loop');
    if (step.execute.type !== 'loop') {
      throw new Error('Expected loop execute');
    }
    expect(step.execute.steps[0]?.id).toBe('inner');
  });

  it('rejects legacy repeat.steps together with top-level steps', () => {
    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: loop
    repeat:
      max: 2
      steps: []
    steps: []
`),
    ).toThrow();
  });

  it('rejects legacy repeat.max when not a positive integer', () => {
    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: loop
    repeat:
      max: 0
    steps: []
`),
    ).toThrow();

    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: loop
    repeat:
      max: 1.5
    steps: []
`),
    ).toThrow();
  });
});

describe('loadWorkflowFromYaml schema: unknown execute.type', () => {
  it('rejects unknown execute.type', () => {
    const error = getZodError(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    execute:
      type: unknown_type
      run: echo ok
`),
    );

    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues[0]?.path).toEqual(['steps', 0, 'execute', 'type']);
  });
});

describe('loadWorkflowFromYaml schema: onError retry max messaging', () => {
  it('rejects onError.type=retry without max with a readable issue path', () => {
    const error = getZodError(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    onError:
      type: retry
    execute:
      type: shell
      run: echo ok
`),
    );

    const issue = error.issues[0];
    expect(issue?.path).toEqual(['steps', 0, 'onError']);

    if (!issue || issue.code !== 'invalid_union') {
      throw new Error(`Unexpected issue code: ${issue?.code ?? 'missing issue'}`);
    }

    const nestedMessages = issue.errors.flat().map((nested) => nested.message);
    const nestedPaths = issue.errors.flat().map((nested) => nested.path.join('.'));

    expect(nestedPaths.join('|')).toContain('max');
    expect(nestedMessages.join('|')).not.toEqual('');
  });
});

describe('loadWorkflowFromYaml schema: execute.steps allowed only for loop', () => {
  it('rejects execute.steps when execute.type is not loop with path info', () => {
    const error = getZodError(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    execute:
      type: shell
      run: echo ok
      steps: []
`),
    );

    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues[0]?.path).toEqual(['steps', 0, 'execute', 'steps']);
  });
});

describe('loadWorkflowFromYaml schema: valid workflows', () => {
  it('parses a shell step', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    execute:
      type: shell
      run: echo ok
`);

    expect(workflow.id).toBe('wf');
    expect(workflow.steps[0]?.execute.type).toBe('shell');
  });

  it('parses an agent step (sdkType/model/prompt)', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    execute:
      type: agent
      sdkType: claude
      model: sonnet
      prompt: hello
`);

    const step = workflow.steps[0];
    if (!step) {
      throw new Error('Missing step');
    }
    expect(step.execute.type).toBe('agent');
    if (step.execute.type !== 'agent') {
      throw new Error('Expected agent execute');
    }
    expect(step.execute.sdkType).toBe('claude');
    expect(step.execute.model).toBe('sonnet');
    expect(step.execute.prompt).toBe('hello');
  });

  it('parses an agent step with structured object', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    execute:
      type: agent
      sdkType: claude
      model: sonnet
      prompt: hello
      structured:
        key: value
`);

    const step = workflow.steps[0];
    if (!step) {
      throw new Error('Missing step');
    }
    expect(step.execute.type).toBe('agent');
    if (step.execute.type !== 'agent') {
      throw new Error('Expected agent execute');
    }
    expect(step.execute.structured).toEqual({ key: 'value' });
  });

  it('parses a slack step', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    execute:
      type: slack
      channel: C123
      message:
        text: hello
`);

    const step = workflow.steps[0];
    if (!step) {
      throw new Error('Missing step');
    }
    expect(step.execute.type).toBe('slack');
    if (step.execute.type !== 'slack') {
      throw new Error('Expected slack execute');
    }
    expect(step.execute.channel).toBe('C123');
    expect(step.execute.message.text).toBe('hello');
  });

  it('parses a loop step with nested steps', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps:
  - id: loop
    execute:
      type: loop
      max: 2
      until: \${{ steps.inner.stdout == "done" }}
      steps:
        - id: inner
          execute:
            type: shell
            run: echo ok
`);

    const step = workflow.steps[0];
    if (!step) {
      throw new Error('Missing step');
    }
    expect(step.execute.type).toBe('loop');
    if (step.execute.type !== 'loop') {
      throw new Error('Expected loop execute');
    }
    expect(step.execute.steps[0]?.id).toBe('inner');
  });

  it('parses a workflow with inputs', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
inputs:
  flag:
    type: boolean
    required: true
  count:
    type: integer
    default: 1
steps:
  - id: s1
    execute:
      type: shell
      run: echo ok
`);

    expect(workflow.inputs?.['flag']).toEqual({ type: 'boolean', required: true });
    expect(workflow.inputs?.['count']?.type).toBe('integer');
  });

  it('parses a workflow with optional fields', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
name: workflow name
description: workflow description
inputs:
  payload:
    type: object
    required: false
steps:
  - id: s1
    name: step name
    needs: [s0]
    if: \${{ inputs.payload != null }}
    timeoutSeconds: 30
    onError:
      type: retry
      max: 2
      strategy: backoff
      seconds: 0.5
      final: skip
    execute:
      type: agent
      sdkType: claude
      model: sonnet
      prompt: hello
      agentType: reviewer
      structured:
        key: value
`);

    expect(workflow.name).toBe('workflow name');
    expect(workflow.description).toBe('workflow description');
    expect(workflow.inputs?.['payload']?.type).toBe('object');

    const step = workflow.steps[0];
    if (!step) {
      throw new Error('Missing step');
    }
    expect(step.name).toBe('step name');
    expect(step.needs).toEqual(['s0']);
    expect(step.if).toBe('${{ inputs.payload != null }}');
    expect(step.timeoutSeconds).toBe(30);
    expect(step.onError).toEqual({
      type: 'retry',
      max: 2,
      strategy: 'backoff',
      seconds: 0.5,
      final: 'skip',
    });
    expect(step.execute.type).toBe('agent');
    if (step.execute.type !== 'agent') {
      throw new Error('Expected agent execute');
    }
    expect(step.execute.agentType).toBe('reviewer');
    expect(step.execute.structured).toEqual({ key: 'value' });
  });
});

describe('loadWorkflowFromYaml schema: inputs', () => {
  it('rejects unknown input.type', () => {
    const error = getZodError(() =>
      loadWorkflowFromYaml(`
id: wf
inputs:
  bad:
    type: unknown
steps: []
`),
    );

    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues[0]?.path).toEqual(['inputs', 'bad', 'type']);
  });

  it('accepts all supported input types', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
inputs:
  b:
    type: boolean
  s:
    type: string
  n:
    type: number
  i:
    type: integer
  o:
    type: object
  a:
    type: array
steps: []
`);

    expect(workflow.inputs?.['b']?.type).toBe('boolean');
    expect(workflow.inputs?.['s']?.type).toBe('string');
    expect(workflow.inputs?.['n']?.type).toBe('number');
    expect(workflow.inputs?.['i']?.type).toBe('integer');
    expect(workflow.inputs?.['o']?.type).toBe('object');
    expect(workflow.inputs?.['a']?.type).toBe('array');
  });
});

describe('loadWorkflowFromYaml schema: error details', () => {
  it('throws a ZodError with issue paths', () => {
    const error = getZodError(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    execute:
      type: shell
      run: 123
`),
    );

    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues[0]?.path.length).toBeGreaterThan(0);
  });
});

describe('loadWorkflowFromYaml schema: structured must be object', () => {
  it('rejects structured as string', () => {
    const error = getZodError(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    execute:
      type: agent
      sdkType: claude
      model: sonnet
      prompt: hello
      structured: "string"
`),
    );

    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues[0]?.path).toEqual(['steps', 0, 'execute', 'structured']);
    expect(error.issues[0]?.message).toContain('structured');
  });

  it('rejects structured as array', () => {
    const error = getZodError(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    execute:
      type: agent
      sdkType: claude
      model: sonnet
      prompt: hello
      structured: [1, 2]
`),
    );

    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues[0]?.path).toEqual(['steps', 0, 'execute', 'structured']);
  });

  it('accepts structured as object', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    execute:
      type: agent
      sdkType: claude
      model: sonnet
      prompt: hello
      structured:
        key: value
`);

    const step = workflow.steps[0];
    if (!step) {
      throw new Error('Missing step');
    }
    expect(step.execute.type).toBe('agent');
    if (step.execute.type !== 'agent') {
      throw new Error('Expected agent execute');
    }
    expect(step.execute.structured).toEqual({ key: 'value' });
  });
});

describe('loadWorkflowFromYaml schema: edge cases', () => {
  it('accepts empty steps array', () => {
    const workflow = loadWorkflowFromYaml(`
id: wf
steps: []
`);

    expect(workflow.steps).toEqual([]);
  });

  it('rejects step with both execute and repeat', () => {
    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    execute:
      type: shell
      run: echo ok
    repeat:
      max: 2
    steps:
      - id: inner
        execute:
          type: shell
          run: echo inner
`),
    ).toThrow();
  });

  it('rejects step without execute or repeat', () => {
    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
`),
    ).toThrow();
  });

  it('rejects missing id', () => {
    const error = getZodError(() =>
      loadWorkflowFromYaml(`
steps: []
`),
    );

    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues[0]?.path).toEqual(['id']);
  });

  it('rejects missing steps', () => {
    const error = getZodError(() =>
      loadWorkflowFromYaml(`
id: wf
`),
    );

    expect(error.issues.length).toBeGreaterThan(0);
    expect(error.issues[0]?.path).toEqual(['steps']);
  });
});

describe('loadWorkflowFromYaml schema: nonnegative/finite numbers', () => {
  it('rejects negative and non-finite timeoutSeconds', () => {
    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    timeoutSeconds: -1
    execute:
      type: shell
      run: echo ok
`),
    ).toThrow();

    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    timeoutSeconds: .inf
    execute:
      type: shell
      run: echo ok
`),
    ).toThrow();
  });

  it('rejects negative and non-finite onError.seconds', () => {
    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    onError:
      type: retry
      max: 1
      seconds: -0.1
    execute:
      type: shell
      run: echo ok
`),
    ).toThrow();

    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    onError:
      type: retry
      max: 1
      seconds: .inf
    execute:
      type: shell
      run: echo ok
`),
    ).toThrow();
  });

  it('rejects negative and non-finite legacy retry.seconds', () => {
    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    retry:
      max: 1
      seconds: -1
    execute:
      type: shell
      run: echo ok
`),
    ).toThrow();

    expect(() =>
      loadWorkflowFromYaml(`
id: wf
steps:
  - id: s1
    retry:
      max: 1
      seconds: .inf
    execute:
      type: shell
      run: echo ok
`),
    ).toThrow();
  });
});
