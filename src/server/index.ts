import type { Config } from '../config/types';
import { saveState } from '../state';
import { startServer as startHonoServer } from './hono/server';

type StartServerOptions = {
  config: Config;
  port: number;
  hostname: string;
};

export const startServer = (options: StartServerOptions) => {
  const { port, hostname } = options;

  // 状態を保存
  saveState({
    server: {
      status: 'running',
      pid: process.pid,
      port,
      host: hostname,
    },
  });

  // プロセス終了時に状態を更新
  process.on('SIGINT', () => {
    saveState({
      server: {
        status: 'closed',
        port,
        host: hostname,
      },
    });
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    saveState({
      server: {
        status: 'closed',
        port,
        host: hostname,
      },
    });
    process.exit(0);
  });

  // Honoサーバーを起動
  return startHonoServer({ config: options.config, port, host: hostname });
};
