import { type LogOutputAdapter } from './types';

export const stderrLogOutputAdapter: LogOutputAdapter = {
  debug: (message) => {
    process.stderr.write(`[debug] ${message}\n`);
  },
  info: (message) => {
    process.stderr.write(`[info] ${message}\n`);
  },
  warn: (message) => {
    process.stderr.write(`[warn] ${message}\n`);
  },
  error: (message) => {
    process.stderr.write(`[error] ${message}\n`);
  },
};
