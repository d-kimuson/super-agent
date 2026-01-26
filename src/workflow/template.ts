import { evaluateExpression, type ExpressionContext, type ExpressionResult } from './expression';

export const renderTemplate = ({
  template,
  context,
}: {
  template: string;
  context: ExpressionContext;
}): ExpressionResult & { value?: string } => {
  const pattern = /\$\{\{([\s\S]+?)\}\}/g;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(template)) !== null) {
    result += template.slice(lastIndex, match.index);
    const rawExpression = match[1]?.trim() ?? '';
    const evaluated = evaluateExpression({ expression: rawExpression, context });
    if (!evaluated.ok) {
      return evaluated;
    }
    const value = evaluated.value;
    let rendered = '';
    if (value === null || value === undefined) {
      rendered = '';
    } else if (typeof value === 'object') {
      rendered = JSON.stringify(value);
    } else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      rendered = String(value);
    } else if (typeof value === 'symbol') {
      rendered = value.description ?? value.toString();
    } else {
      rendered = '';
    }
    result += rendered;
    lastIndex = match.index + match[0].length;
  }

  result += template.slice(lastIndex);
  return { ok: true, value: result };
};
