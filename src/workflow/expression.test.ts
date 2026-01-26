import { describe, expect, it } from 'vitest';
import { evaluateExpression, evaluateCondition } from './expression';

const getValue = (result: ReturnType<typeof evaluateExpression>) => {
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
};

const context = {
  inputs: {
    'create-branch': true,
    'ci-check': false,
    count: 2,
  },
  steps: {
    review: {
      structured: {
        approved: false,
      },
    },
    select_issue: {
      structured: {
        title: 'Hello',
      },
      output: 'fallback-title',
    },
  },
};

describe('evaluateExpression', () => {
  it('evaluates literals', () => {
    expect(getValue(evaluateExpression({ expression: 'true', context }))).toBe(true);
    expect(getValue(evaluateExpression({ expression: 'false', context }))).toBe(false);
    expect(getValue(evaluateExpression({ expression: 'null', context }))).toBe(null);
    expect(getValue(evaluateExpression({ expression: '123', context }))).toBe(123);
    expect(getValue(evaluateExpression({ expression: '"text"', context }))).toBe('text');
    expect(getValue(evaluateExpression({ expression: "'text'", context }))).toBe('text');
  });

  it('evaluates dotted access with hyphen keys', () => {
    const result = evaluateExpression({
      expression: 'inputs.create-branch',
      context,
    });
    expect(result.ok).toBe(true);
    expect(getValue(result)).toBe(true);
  });

  it('respects operator precedence', () => {
    const result = evaluateExpression({
      expression: 'false || true && false',
      context,
    });
    expect(result.ok).toBe(true);
    expect(getValue(result)).toBe(false);
  });

  it('supports fallback with ||', () => {
    const result = evaluateExpression({
      expression:
        "steps.select_issue.structured.missing || steps.select_issue.structured.title || 'AI'",
      context,
    });
    expect(result.ok).toBe(true);
    expect(getValue(result)).toBe('Hello');
  });

  it('supports negation and parentheses', () => {
    const result = evaluateCondition({
      expression: '!(steps.review.structured.approved == true)',
      context,
    });
    expect(result.ok).toBe(true);
    expect(getValue(result)).toBe(true);
  });

  it('errors on unknown root identifiers', () => {
    const result = evaluateExpression({
      expression: 'unknown.value == true',
      context,
    });
    expect(result.ok).toBe(false);
  });
});
