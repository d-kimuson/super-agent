import type { Flags } from './flags';

export type ICtx = {
  rawInput: unknown;
  input: unknown;
  steps: Record<string, unknown>;
  flags: Flags;
  state: unknown;
};
