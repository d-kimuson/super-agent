import { describe, expect, it } from 'vitest';
import { coerceInputValue, mergeInputs } from './inputs';
import { type WorkflowDefinition } from './types';

const getValue = (result: ReturnType<typeof coerceInputValue>) => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

const getMergeValue = (result: ReturnType<typeof mergeInputs>) => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

describe('coerceInputValue', () => {
  it('coerces boolean values', () => {
    expect(getValue(coerceInputValue({ type: 'boolean', value: 'true' }))).toBe(true);
    expect(getValue(coerceInputValue({ type: 'boolean', value: 'false' }))).toBe(false);
    expect(getValue(coerceInputValue({ type: 'boolean', value: '1' }))).toBe(true);
    expect(getValue(coerceInputValue({ type: 'boolean', value: '0' }))).toBe(false);
  });

  it('coerces number and integer', () => {
    expect(getValue(coerceInputValue({ type: 'number', value: '1.5' }))).toBe(1.5);
    expect(getValue(coerceInputValue({ type: 'integer', value: '2' }))).toBe(2);
  });

  it('parses object and array from JSON string', () => {
    const obj = coerceInputValue({ type: 'object', value: '{"a":1}' });
    expect(obj.ok).toBe(true);
    expect(getValue(obj)).toEqual({ a: 1 });

    const arr = coerceInputValue({ type: 'array', value: '[1,2]' });
    expect(arr.ok).toBe(true);
    expect(getValue(arr)).toEqual([1, 2]);
  });
});

describe('mergeInputs', () => {
  it('merges and coerces with definitions', () => {
    const defs: WorkflowDefinition['inputs'] = {
      flag: { type: 'boolean' },
      count: { type: 'integer' },
    };
    const result = mergeInputs({
      defs,
      inputs: { flag: 'true', count: '3' },
      strict: false,
    });
    expect(result.ok).toBe(true);
    expect(getMergeValue(result)).toEqual({ flag: true, count: 3 });
  });
});
