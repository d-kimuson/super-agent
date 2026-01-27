import { describe, expect, it } from 'vitest';
import { loadWorkflowFromYaml } from './loader';

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
