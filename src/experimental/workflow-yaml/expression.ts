export type ExpressionContext = {
  inputs: Record<string, unknown>;
  steps: Record<string, unknown>;
};

export type ExpressionError = {
  code: 'parse-error' | 'unknown-identifier' | 'unsupported-syntax';
  message: string;
  position?: number;
};

export type ExpressionResult = { ok: true; value: unknown } | { ok: false; error: ExpressionError };

type TokenType =
  | 'identifier'
  | 'number'
  | 'string'
  | 'boolean'
  | 'null'
  | 'operator'
  | 'paren'
  | 'comma'
  | 'dot'
  | 'eof';

type Token = {
  type: TokenType;
  value?: string;
  position: number;
};

type AstNode =
  | { type: 'literal'; value: unknown }
  | { type: 'path'; path: string[] }
  | { type: 'functionCall'; name: string; args: AstNode[] }
  | { type: 'unary'; operator: '!'; expr: AstNode }
  | {
      type: 'binary';
      operator: '&&' | '||' | '==' | '!=' | '>' | '<' | '>=' | '<=';
      left: AstNode;
      right: AstNode;
    };

type TokenizeResult = { ok: true; tokens: Token[] } | { ok: false; error: ExpressionError };

type AstResult = { ok: true; ast: AstNode } | { ok: false; error: ExpressionError };

const isIdentifierStart = (char: string) => /[A-Za-z_]/.test(char);
const isIdentifierPart = (char: string) => /[A-Za-z0-9_-]/.test(char);

const tokenize = (source: string): TokenizeResult => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const char = source.charAt(i);
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      i += 1;
      continue;
    }

    const position = i;

    const twoChar = source.slice(i, i + 2);
    if (
      twoChar === '==' ||
      twoChar === '!=' ||
      twoChar === '&&' ||
      twoChar === '||' ||
      twoChar === '>=' ||
      twoChar === '<='
    ) {
      tokens.push({ type: 'operator', value: twoChar, position });
      i += 2;
      continue;
    }

    if (char === '!' || char === '>' || char === '<') {
      tokens.push({ type: 'operator', value: char, position });
      i += 1;
      continue;
    }

    if (char === '(' || char === ')') {
      tokens.push({ type: 'paren', value: char, position });
      i += 1;
      continue;
    }

    if (char === ',') {
      tokens.push({ type: 'comma', value: ',', position });
      i += 1;
      continue;
    }

    if (char === '.') {
      tokens.push({ type: 'dot', value: '.', position });
      i += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      i += 1;
      let value = '';
      let closed = false;
      while (i < source.length) {
        const current = source[i];
        if (current === '\\') {
          const next = source[i + 1];
          if (next !== undefined) {
            value += next;
            i += 2;
            continue;
          }
        }
        if (current === quote) {
          closed = true;
          i += 1;
          break;
        }
        value += current;
        i += 1;
      }
      if (!closed) {
        return {
          ok: false,
          error: {
            code: 'parse-error',
            message: 'Unclosed string literal',
            position,
          },
        };
      }
      tokens.push({ type: 'string', value, position });
      continue;
    }

    if (/[0-9]/.test(char)) {
      let value = char;
      i += 1;
      while (i < source.length) {
        const current = source.charAt(i);
        if (!/[0-9.]/.test(current)) {
          break;
        }
        value += current;
        i += 1;
      }
      tokens.push({ type: 'number', value, position });
      continue;
    }

    if (isIdentifierStart(char)) {
      let value = char;
      i += 1;
      while (i < source.length && isIdentifierPart(source.charAt(i))) {
        value += source.charAt(i);
        i += 1;
      }
      if (value === 'true' || value === 'false') {
        tokens.push({ type: 'boolean', value, position });
      } else if (value === 'null') {
        tokens.push({ type: 'null', value, position });
      } else {
        tokens.push({ type: 'identifier', value, position });
      }
      continue;
    }

    return {
      ok: false,
      error: {
        code: 'parse-error',
        message: `Unexpected character: ${char}`,
        position,
      },
    };
  }

  tokens.push({ type: 'eof', position: source.length });
  return { ok: true, tokens };
};

const parse = (source: string): AstResult => {
  const tokenized = tokenize(source);
  if (!tokenized.ok) {
    return tokenized;
  }
  const tokens = tokenized.tokens;
  let index = 0;

  const peek = (): Token => tokens[index] ?? { type: 'eof', position: source.length };
  const consume = (): Token => tokens[index++] ?? { type: 'eof', position: source.length };

  const fail = (message: string, position?: number): AstResult => ({
    ok: false,
    error: {
      code: 'parse-error',
      message,
      position,
    },
  });

  const expect = (type: TokenType, value?: string): Token | null => {
    const token = consume();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      return null;
    }
    return token;
  };

  const parsePrimary = (): AstResult => {
    const token = peek();
    if (token.type === 'paren' && token.value === '(') {
      consume();
      const expr = parseExpression();
      if (!expr.ok) {
        return expr;
      }
      const closing = expect('paren', ')');
      if (!closing) {
        return fail('Expected closing paren', token.position);
      }
      return { ok: true, ast: expr.ast };
    }

    if (token.type === 'string') {
      consume();
      return { ok: true, ast: { type: 'literal', value: token.value ?? '' } };
    }

    if (token.type === 'number') {
      consume();
      return { ok: true, ast: { type: 'literal', value: Number(token.value) } };
    }

    if (token.type === 'boolean') {
      consume();
      return { ok: true, ast: { type: 'literal', value: token.value === 'true' } };
    }

    if (token.type === 'null') {
      consume();
      return { ok: true, ast: { type: 'literal', value: null } };
    }

    if (token.type === 'identifier') {
      const first = consume();
      const identifier = first.value ?? '';

      if (peek().type === 'paren' && peek().value === '(') {
        consume();
        const args: AstNode[] = [];
        if (!(peek().type === 'paren' && peek().value === ')')) {
          const firstArg = parseExpression();
          if (!firstArg.ok) {
            return firstArg;
          }
          args.push(firstArg.ast);
          while (peek().type === 'comma') {
            consume();
            const arg = parseExpression();
            if (!arg.ok) {
              return arg;
            }
            args.push(arg.ast);
          }
        }
        const closing = expect('paren', ')');
        if (!closing) {
          return fail('Expected closing paren', first.position);
        }
        return { ok: true, ast: { type: 'functionCall', name: identifier, args } };
      }

      const path: string[] = [identifier];
      while (peek().type === 'dot') {
        consume();
        const next = peek();
        if (next.type !== 'identifier') {
          return fail('Expected identifier after dot', next.position);
        }
        path.push(next.value ?? '');
        consume();
      }
      return { ok: true, ast: { type: 'path', path } };
    }

    return fail('Unexpected token in expression', token.position);
  };

  const parseUnary = (): AstResult => {
    const token = peek();
    if (token.type === 'operator' && token.value === '!') {
      consume();
      const expr = parseUnary();
      if (!expr.ok) {
        return expr;
      }
      return { ok: true, ast: { type: 'unary', operator: '!', expr: expr.ast } };
    }
    return parsePrimary();
  };

  const parseComparison = (): AstResult => {
    let left = parseUnary();
    if (!left.ok) {
      return left;
    }
    while (
      peek().type === 'operator' &&
      (peek().value === '>' ||
        peek().value === '<' ||
        peek().value === '>=' ||
        peek().value === '<=')
    ) {
      const operatorToken = consume();
      const op = operatorToken.value;
      if (op !== '>' && op !== '<' && op !== '>=' && op !== '<=') {
        return fail('Invalid operator', operatorToken.position);
      }
      const right = parseUnary();
      if (!right.ok) {
        return right;
      }
      left = {
        ok: true,
        ast: { type: 'binary', operator: op, left: left.ast, right: right.ast },
      };
    }
    return left;
  };

  const parseEquality = (): AstResult => {
    let left = parseComparison();
    if (!left.ok) {
      return left;
    }
    while (peek().type === 'operator' && (peek().value === '==' || peek().value === '!=')) {
      const operatorToken = consume();
      if (operatorToken.value !== '==' && operatorToken.value !== '!=') {
        return fail('Invalid operator', operatorToken.position);
      }
      const right = parseComparison();
      if (!right.ok) {
        return right;
      }
      left = {
        ok: true,
        ast: {
          type: 'binary',
          operator: operatorToken.value,
          left: left.ast,
          right: right.ast,
        },
      };
    }
    return left;
  };

  const parseAnd = (): AstResult => {
    let left = parseEquality();
    if (!left.ok) {
      return left;
    }
    while (peek().type === 'operator' && peek().value === '&&') {
      consume();
      const right = parseEquality();
      if (!right.ok) {
        return right;
      }
      left = {
        ok: true,
        ast: {
          type: 'binary',
          operator: '&&',
          left: left.ast,
          right: right.ast,
        },
      };
    }
    return left;
  };

  const parseOr = (): AstResult => {
    let left = parseAnd();
    if (!left.ok) {
      return left;
    }
    while (peek().type === 'operator' && peek().value === '||') {
      consume();
      const right = parseAnd();
      if (!right.ok) {
        return right;
      }
      left = {
        ok: true,
        ast: {
          type: 'binary',
          operator: '||',
          left: left.ast,
          right: right.ast,
        },
      };
    }
    return left;
  };

  const parseExpression = (): AstResult => parseOr();

  const result = parseExpression();
  if (!result.ok) {
    return result;
  }

  const endToken = peek();
  if (endToken.type !== 'eof') {
    return fail('Unexpected trailing tokens', endToken.position);
  }

  return { ok: true, ast: result.ast };
};

const isNullish = (value: unknown) => value === null || value === undefined;

const isTruthy = (value: unknown) => Boolean(value);

const isEqual = (left: unknown, right: unknown) => {
  if (isNullish(left) && isNullish(right)) {
    return true;
  }
  return Object.is(left, right);
};

const getObjectValue = (value: object, key: string): unknown => {
  for (const entry of Object.entries(value)) {
    const entryKey = entry[0];
    const entryValue: unknown = entry[1];
    if (entryKey === key) {
      return entryValue;
    }
  }
  return undefined;
};

const evaluatePath = (path: string[], context: ExpressionContext): ExpressionResult => {
  const root = path[0];
  if (root !== 'inputs' && root !== 'steps') {
    return {
      ok: false,
      error: {
        code: 'unknown-identifier',
        message: `Unknown root identifier: ${root}`,
      },
    };
  }

  let current: unknown = root === 'inputs' ? context.inputs : context.steps;
  for (let i = 1; i < path.length; i += 1) {
    if (current === null || current === undefined) {
      return { ok: true, value: undefined };
    }
    if (typeof current !== 'object' || Array.isArray(current)) {
      return { ok: true, value: undefined };
    }
    const segment = path[i];
    if (segment === undefined) {
      return { ok: true, value: undefined };
    }
    current = getObjectValue(current, segment);
  }

  return { ok: true, value: current };
};

const evaluateAst = (node: AstNode, context: ExpressionContext): ExpressionResult => {
  switch (node.type) {
    case 'literal':
      return { ok: true, value: node.value };
    case 'path':
      return evaluatePath(node.path, context);
    case 'functionCall': {
      if (node.name !== 'trim' && node.name !== 'trimEnd' && node.name !== 'stripNewline') {
        return {
          ok: false,
          error: {
            code: 'unknown-identifier',
            message: `Unknown function: ${node.name}`,
          },
        };
      }

      if (node.args.length !== 1) {
        return {
          ok: false,
          error: {
            code: 'unsupported-syntax',
            message: `Function ${node.name}() requires 1 argument`,
          },
        };
      }

      const argNode = node.args[0];
      if (argNode === undefined) {
        return {
          ok: false,
          error: {
            code: 'unsupported-syntax',
            message: `Function ${node.name}() requires 1 argument`,
          },
        };
      }

      const arg = evaluateAst(argNode, context);
      if (!arg.ok) {
        return arg;
      }
      if (typeof arg.value !== 'string') {
        return {
          ok: false,
          error: {
            code: 'unsupported-syntax',
            message: `Function ${node.name}() requires a string argument`,
          },
        };
      }

      if (node.name === 'trim') {
        return { ok: true, value: arg.value.trim() };
      }
      if (node.name === 'trimEnd') {
        return { ok: true, value: arg.value.trimEnd() };
      }

      if (arg.value.endsWith('\r\n')) {
        return { ok: true, value: arg.value.slice(0, -2) };
      }
      if (arg.value.endsWith('\n')) {
        return { ok: true, value: arg.value.slice(0, -1) };
      }
      return { ok: true, value: arg.value };
    }
    case 'unary': {
      const result = evaluateAst(node.expr, context);
      if (!result.ok) {
        return result;
      }
      return { ok: true, value: !isTruthy(result.value) };
    }
    case 'binary': {
      if (node.operator === '||') {
        const left = evaluateAst(node.left, context);
        if (!left.ok) {
          return left;
        }
        if (isTruthy(left.value)) {
          return left;
        }
        return evaluateAst(node.right, context);
      }
      if (node.operator === '&&') {
        const left = evaluateAst(node.left, context);
        if (!left.ok) {
          return left;
        }
        if (!isTruthy(left.value)) {
          return left;
        }
        return evaluateAst(node.right, context);
      }
      if (
        node.operator === '>' ||
        node.operator === '<' ||
        node.operator === '>=' ||
        node.operator === '<='
      ) {
        const left = evaluateAst(node.left, context);
        if (!left.ok) {
          return left;
        }
        const right = evaluateAst(node.right, context);
        if (!right.ok) {
          return right;
        }
        if (typeof left.value !== 'number' || typeof right.value !== 'number') {
          return {
            ok: false,
            error: {
              code: 'unsupported-syntax',
              message: 'Comparison operators require numeric operands',
            },
          };
        }
        switch (node.operator) {
          case '>':
            return { ok: true, value: left.value > right.value };
          case '<':
            return { ok: true, value: left.value < right.value };
          case '>=':
            return { ok: true, value: left.value >= right.value };
          case '<=':
            return { ok: true, value: left.value <= right.value };
          default:
            return {
              ok: false,
              error: {
                code: 'unsupported-syntax',
                message: 'Unsupported expression syntax',
              },
            };
        }
      }
      const left = evaluateAst(node.left, context);
      if (!left.ok) {
        return left;
      }
      const right = evaluateAst(node.right, context);
      if (!right.ok) {
        return right;
      }
      if (node.operator !== '==' && node.operator !== '!=') {
        return {
          ok: false,
          error: {
            code: 'unsupported-syntax',
            message: 'Unsupported expression syntax',
          },
        };
      }
      const comparison = isEqual(left.value, right.value);
      return { ok: true, value: node.operator === '==' ? comparison : !comparison };
    }
    default:
      return {
        ok: false,
        error: {
          code: 'unsupported-syntax',
          message: 'Unsupported expression syntax',
        },
      };
  }
};

export const evaluateExpression = ({
  expression,
  context,
}: {
  expression: string;
  context: ExpressionContext;
}): ExpressionResult => {
  const parsed = parse(expression);
  if (!parsed.ok) {
    return parsed;
  }

  return evaluateAst(parsed.ast, context);
};

export const evaluateCondition = ({
  expression,
  context,
}: {
  expression: string;
  context: ExpressionContext;
}): ExpressionResult => {
  const evaluated = evaluateExpression({ expression, context });
  if (!evaluated.ok) {
    return evaluated;
  }
  return { ok: true, value: Boolean(evaluated.value) };
};
