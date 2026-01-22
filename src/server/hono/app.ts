import { Hono } from 'hono';
import type { Config } from '../../config/types';

export type HonoContext = {
  Variables: {
    config: Config;
  };
};

export const honoApp = new Hono<HonoContext>();

export type HonoAppType = typeof honoApp;
