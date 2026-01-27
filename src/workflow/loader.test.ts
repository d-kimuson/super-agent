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
