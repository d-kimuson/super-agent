import type { Config } from '../../config/types';
import { systemRoute } from '../routes/system/route';
import { tasksRoute } from '../routes/task/routes';
import { type HonoAppType } from './app';

export const routes = (app: HonoAppType, config: Config) => {
  return (
    app
      .use('*', async (c, next) => {
        c.set('config', config);
        await next();
      })
      // routes
      .route('/system', systemRoute)
      .route('/task', tasksRoute())
  );
};

export type RouteType = ReturnType<typeof routes>;
