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

describe('evaluateExpression - function calls', () => {
  const contextWithStdout = {
    inputs: {},
    steps: {
      counter: { stdout: '3\n' },
      padded: { stdout: '  hello  \n' },
      crlf: { stdout: 'value\r\n' },
      clean: { stdout: 'notrail' },
    },
  };

  it('evaluates trimEnd()', () => {
    const result = evaluateExpression({
      expression: 'trimEnd(steps.counter.stdout) == "3"',
      context: contextWithStdout,
    });
    expect(result.ok).toBe(true);
    expect(getValue(result)).toBe(true);
  });

  it('evaluates trim()', () => {
    const result = evaluateExpression({
      expression: 'trim(steps.padded.stdout) == "hello"',
      context: contextWithStdout,
    });
    expect(result.ok).toBe(true);
    expect(getValue(result)).toBe(true);
  });

  it('evaluates trimEnd() without trimming left', () => {
    const result = evaluateExpression({
      expression: 'trimEnd(steps.padded.stdout) == "  hello"',
      context: contextWithStdout,
    });
    expect(result.ok).toBe(true);
    expect(getValue(result)).toBe(true);
  });

  it('evaluates stripNewline()', () => {
    expect(
      getValue(
        evaluateExpression({
          expression: 'stripNewline(steps.counter.stdout) == "3"',
          context: contextWithStdout,
        }),
      ),
    ).toBe(true);

    expect(
      getValue(
        evaluateExpression({
          expression: 'stripNewline(steps.crlf.stdout) == "value"',
          context: contextWithStdout,
        }),
      ),
    ).toBe(true);

    expect(
      getValue(
        evaluateExpression({
          expression: 'stripNewline(steps.clean.stdout) == "notrail"',
          context: contextWithStdout,
        }),
      ),
    ).toBe(true);
  });

  it('supports string literal argument', () => {
    const result = evaluateExpression({
      expression: 'trim(" 3\n ") == "3"',
      context: contextWithStdout,
    });
    expect(result.ok).toBe(true);
    expect(getValue(result)).toBe(true);
  });

  it('errors on unknown function', () => {
    const result = evaluateExpression({
      expression: 'unknown(steps.counter.stdout)',
      context: contextWithStdout,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unknown-identifier');
      expect(result.error.message).toBe('Unknown function: unknown');
    }
  });

  it('errors when function arg is not a string', () => {
    const result = evaluateExpression({
      expression: 'trim(123)',
      context: contextWithStdout,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unsupported-syntax');
      expect(result.error.message).toBe('Function trim() requires a string argument');
    }
  });

  it('supports function calls in conditions', () => {
    const result = evaluateCondition({
      expression: 'trimEnd(steps.counter.stdout) == "3"',
      context: contextWithStdout,
    });
    expect(result.ok).toBe(true);
    expect(getValue(result)).toBe(true);
  });
});

describe('evaluateExpression - comparison operators', () => {
  it('evaluates > with numbers', () => {
    expect(getValue(evaluateExpression({ expression: '10 > 2', context }))).toBe(true);
    expect(getValue(evaluateExpression({ expression: '2 > 10', context }))).toBe(false);
    expect(getValue(evaluateExpression({ expression: '5 > 5', context }))).toBe(false);
  });

  it('evaluates < with numbers', () => {
    expect(getValue(evaluateExpression({ expression: '2 < 10', context }))).toBe(true);
    expect(getValue(evaluateExpression({ expression: '10 < 2', context }))).toBe(false);
    expect(getValue(evaluateExpression({ expression: '1 < 0', context }))).toBe(false);
  });

  it('evaluates >= with numbers', () => {
    expect(getValue(evaluateExpression({ expression: '10 >= 10', context }))).toBe(true);
    expect(getValue(evaluateExpression({ expression: '11 >= 10', context }))).toBe(true);
    expect(getValue(evaluateExpression({ expression: '9 >= 10', context }))).toBe(false);
  });

  it('evaluates <= with numbers', () => {
    expect(getValue(evaluateExpression({ expression: '10 <= 10', context }))).toBe(true);
    expect(getValue(evaluateExpression({ expression: '9 <= 10', context }))).toBe(true);
    expect(getValue(evaluateExpression({ expression: '11 <= 10', context }))).toBe(false);
  });

  it('evaluates comparison with path references', () => {
    expect(getValue(evaluateExpression({ expression: 'inputs.count > 1', context }))).toBe(true);
    expect(getValue(evaluateExpression({ expression: 'inputs.count <= 2', context }))).toBe(true);
  });

  it('errors when operands are not numbers', () => {
    const result = evaluateExpression({ expression: '"10" > 2', context });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unsupported-syntax');
      expect(result.error.message).toBe('Comparison operators require numeric operands');
    }
  });

  it('errors when comparing boolean to number', () => {
    const result = evaluateExpression({ expression: 'true > 0', context });
    expect(result.ok).toBe(false);
  });

  it('supports comparison in conditions', () => {
    const result = evaluateCondition({ expression: 'inputs.count > 1', context });
    expect(result.ok).toBe(true);
    expect(getValue(result)).toBe(true);
  });
});
