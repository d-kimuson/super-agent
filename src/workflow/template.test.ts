import { describe, expect, it } from 'vitest';
import { renderTemplate } from './template';

const context = {
  inputs: {
    name: 'world',
  },
  steps: {
    step1: {
      output: 'hello',
    },
    obj: {
      structured: {
        key: 'value',
      },
    },
  },
};

describe('renderTemplate', () => {
  it('replaces multiple expressions', () => {
    const result = renderTemplate({
      template: 'Say ${{ steps.step1.output }} to ${{ inputs.name }}',
      context,
    });
    expect(result.ok).toBe(true);
    expect(result.value).toBe('Say hello to world');
  });

  it('stringifies object values', () => {
    const result = renderTemplate({
      template: 'obj=${{ steps.obj.structured }}',
      context,
    });
    expect(result.ok).toBe(true);
    expect(result.value).toBe('obj=' + JSON.stringify({ key: 'value' }));
  });

  it('returns empty string for nullish values', () => {
    const result = renderTemplate({
      template: 'missing:${{ steps.step1.missing }}',
      context,
    });
    expect(result.ok).toBe(true);
    expect(result.value).toBe('missing:');
  });
});
