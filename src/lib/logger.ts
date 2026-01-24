import { consoleLogOutputAdapter } from './console';
import { stderrLogOutputAdapter } from './stderr';
import { type LoggerType } from './types';

let loggerState: LoggerType = 'console';

const getAdapter = () => {
  if (loggerState === 'console') {
    return consoleLogOutputAdapter;
  }

  if (loggerState === 'stderr') {
    return stderrLogOutputAdapter;
  }

  loggerState satisfies never;
  throw new Error('Invalid logger type');
};

const logArgsToString = (args: readonly unknown[]): string => {
  return args
    .map((arg) => {
      if (typeof arg === 'string') {
        return arg;
      }

      // primitive values
      if (
        typeof arg === 'number' ||
        typeof arg === 'bigint' ||
        typeof arg === 'boolean' ||
        typeof arg === 'undefined' ||
        arg === null
      ) {
        return String(arg);
      }

      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}${arg.stack !== undefined ? `\n${arg.stack}` : ''}`;
      }

      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          // eslint-disable-next-line no-base-to-string
          return String(arg);
        }
      }

      // eslint-disable-next-line no-base-to-string
      return String(arg);
    })
    .join(' ');
};

export const logger = {
  getLoggerType: () => loggerState,
  setLoggerType: (loggerType: LoggerType) => {
    loggerState = loggerType;
  },
  debug: (...args: readonly unknown[]) => {
    getAdapter().debug(logArgsToString(args));
  },
  info: (...args: readonly unknown[]) => {
    getAdapter().info(logArgsToString(args));
  },
  warn: (...args: readonly unknown[]) => {
    getAdapter().warn(logArgsToString(args));
  },
  error: (...args: readonly unknown[]) => {
    getAdapter().error(logArgsToString(args));
  },
} as const;
