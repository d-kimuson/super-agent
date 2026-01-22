import { serve } from '@hono/node-server';
import type { Config } from '../../config/types';
import { logger } from '../../lib/logger';
import { honoApp } from './app';
import { routes } from './routes';

type StartServerOptions = {
  config: Config;
  port: number;
  host?: string;
};

export const startServer = (options: StartServerOptions) => {
  const { config, port, host = 'localhost' } = options;

  const app = routes(honoApp, config);

  serve(
    {
      fetch: app.fetch,
      port,
      hostname: host,
    },
    (info) => {
      logger.info(`Server is running on http://${host}:${info.port}`);
    },
  );
};
