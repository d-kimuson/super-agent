import { Hono } from 'hono';
import { type HonoContext } from '../../hono/app';

export const systemRoute = new Hono<HonoContext>()
  // endpoints
  .get('/health', (c) =>
    c.json({
      status: 'healthy',
      server: 'agent-bridge',
    }),
  );
