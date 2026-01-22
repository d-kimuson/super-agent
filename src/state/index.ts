import { merge } from 'es-toolkit';
import { readFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { paths } from '../lib/paths';
import { stateSchema, type State } from './schema';

let stateCache: State | undefined;

const loadState = () => {
  try {
    const stateFile = paths.stateFile;
    const state = readFileSync(stateFile, 'utf-8');
    return stateSchema.parse(JSON.parse(state));
  } catch {
    return stateSchema.parse({});
  }
};

export const getState = () => {
  return (stateCache ??= loadState());
};

export const saveState = (state: Partial<State>) => {
  stateCache ??= loadState();
  stateCache = merge(stateCache, state);
  void (async () => {
    await mkdir(dirname(paths.stateFile), { recursive: true });
    await writeFile(paths.stateFile, JSON.stringify(stateCache, null, 2));
  })();
};
