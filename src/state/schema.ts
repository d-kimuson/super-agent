import z from 'zod';

export const stateSchema = z.object({
  server: z
    .union([
      z.object({
        status: z.literal('running'),
        pid: z.number(),
        port: z.number(),
        host: z.string(),
      }),
      z.object({
        status: z.literal('closed'),
        pid: z.undefined().optional(),
        port: z.number(),
        host: z.string(),
      }),
      z.undefined(),
    ])
    .optional(),
});

export type State = z.infer<typeof stateSchema>;
