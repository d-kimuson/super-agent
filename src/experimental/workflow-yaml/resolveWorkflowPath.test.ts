import { describe, expect, it } from 'vitest';
import { resolveWorkflowPath } from './resolveWorkflowPath';

const normalize = (value: string) => value.replace(/\\/g, '/');

describe('resolveWorkflowPath', () => {
  it('appends .yaml when no extension is provided', () => {
    const result = resolveWorkflowPath({
      name: 'sample',
      workflowDir: '/tmp/workflows',
      cwd: '/repo',
    });
    expect(normalize(result)).toBe('/tmp/workflows/sample.yaml');
  });

  it('keeps existing extension', () => {
    const result = resolveWorkflowPath({
      name: 'sample.yml',
      workflowDir: '/tmp/workflows',
      cwd: '/repo',
    });
    expect(normalize(result)).toBe('/tmp/workflows/sample.yml');
  });

  it('resolves absolute paths without workflowDir', () => {
    const result = resolveWorkflowPath({
      name: '/var/data/workflow',
      workflowDir: '/tmp/workflows',
      cwd: '/repo',
    });
    expect(normalize(result)).toBe('/var/data/workflow.yaml');
  });
});
