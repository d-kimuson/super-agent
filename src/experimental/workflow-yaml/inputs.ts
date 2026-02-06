import { type InputDef } from './types';

type CoerceResult = { ok: true; value: unknown } | { ok: false; error: string };

const isRecord = (value: unknown) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return true;
};

const parseJsonValue = (
  value: string,
): { ok: true; value: unknown } | { ok: false; error: string } => {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
};

export const coerceInputValue = ({
  type,
  value,
}: {
  type: InputDef['type'];
  value: unknown;
}): CoerceResult => {
  if (type === 'string') {
    return { ok: true, value: typeof value === 'string' ? value : String(value) };
  }

  if (type === 'boolean') {
    if (typeof value === 'boolean') {
      return { ok: true, value };
    }
    if (typeof value === 'number') {
      return { ok: true, value: value !== 0 };
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
        return { ok: true, value: true };
      }
      if (normalized === 'false' || normalized === '0' || normalized === 'no') {
        return { ok: true, value: false };
      }
    }
    return { ok: false, error: `Invalid boolean value: ${String(value)}` };
  }

  if (type === 'number' || type === 'integer') {
    if (typeof value === 'number') {
      if (type === 'integer' && !Number.isInteger(value)) {
        return { ok: false, error: `Invalid integer value: ${value}` };
      }
      return { ok: true, value };
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        return { ok: false, error: `Invalid number value: ${value}` };
      }
      if (type === 'integer' && !Number.isInteger(parsed)) {
        return { ok: false, error: `Invalid integer value: ${value}` };
      }
      return { ok: true, value: parsed };
    }
    return { ok: false, error: `Invalid number value: ${String(value)}` };
  }

  if (type === 'object') {
    if (isRecord(value)) {
      return { ok: true, value };
    }
    if (typeof value === 'string') {
      const parsed = parseJsonValue(value);
      if (!parsed.ok) {
        return parsed;
      }
      if (isRecord(parsed.value)) {
        return { ok: true, value: parsed.value };
      }
      return { ok: false, error: 'Expected object JSON value' };
    }
    return { ok: false, error: 'Expected object value' };
  }

  if (type === 'array') {
    if (Array.isArray(value)) {
      return { ok: true, value };
    }
    if (typeof value === 'string') {
      const parsed = parseJsonValue(value);
      if (!parsed.ok) {
        return parsed;
      }
      if (Array.isArray(parsed.value)) {
        return { ok: true, value: parsed.value };
      }
      return { ok: false, error: 'Expected array JSON value' };
    }
    return { ok: false, error: 'Expected array value' };
  }

  return { ok: false, error: `Unsupported input type: ${String(type)}` };
};

type MergeInputsResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

export const mergeInputs = ({
  defs,
  inputs,
  strict,
}: {
  defs: Record<string, InputDef> | undefined;
  inputs: Record<string, unknown>;
  strict: boolean;
}): MergeInputsResult => {
  if (!defs) {
    return { ok: true, value: inputs };
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputs)) {
    const def = defs[key];
    if (!def) {
      if (strict) {
        return { ok: false, error: `Unknown input: ${key}` };
      }
      result[key] = value;
      continue;
    }
    const coerced = coerceInputValue({ type: def.type, value });
    if (!coerced.ok) {
      return { ok: false, error: `Input ${key}: ${coerced.error}` };
    }
    result[key] = coerced.value;
  }

  return { ok: true, value: result };
};
