/* eslint-disable no-console */
import { type LogOutputAdapter } from './types';

export const consoleLogOutputAdapter: LogOutputAdapter = {
  debug: (message) => {
    console.debug(message);
  },
  info: (message) => {
    console.info(message);
  },
  warn: (message) => {
    console.warn(message);
  },
  error: (message) => {
    console.error(message);
  },
};
