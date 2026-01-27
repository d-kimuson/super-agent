import { z } from 'zod';
import { providersSchema } from '../config/schema';
import {
  type OnError,
  type RetryStrategy,
  type StepDefinition,
  type WorkflowDefinition,
} from './types';

export const inputDefSchema = z.object({
  type: z.enum(['boolean', 'string', 'number', 'integer', 'object', 'array']),
  default: z.unknown().optional(),
  required: z.boolean().optional(),
});

export const retryStrategySchema = z.enum(['fixed', 'backoff']);

export const onErrorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fail') }).strict(),
  z.object({ type: z.literal('skip') }).strict(),
  z
    .object({
      type: z.literal('retry'),
      max: z.number().int().min(1),
      strategy: retryStrategySchema.optional(),
      seconds: z.number().nonnegative().optional(),
      final: z.enum(['fail', 'skip']).optional(),
    })
    .strict(),
]);

export const shellExecuteSchema = z.object({
  type: z.literal('shell'),
  run: z.string(),
});

export const agentExecuteSchema = z.object({
  type: z.literal('agent'),
  sdkType: providersSchema,
  model: z.string(),
  prompt: z.string(),
  structured: z.unknown().optional(),
  agentType: z.string().optional(),
});

export const slackExecuteSchema = z.object({
  type: z.literal('slack'),
  channel: z.string(),
  message: z.object({ text: z.string() }),
});

export const stepDefinitionSchema = z.lazy((): z.ZodType<StepDefinition> => {
  const loopExecuteSchema = z.object({
    type: z.literal('loop'),
    max: z.number().int().min(1),
    until: z.string().optional(),
    steps: z.array(stepDefinitionSchema),
  });

  const nonLoopExecuteSchema = z.discriminatedUnion('type', [
    shellExecuteSchema,
    agentExecuteSchema,
    slackExecuteSchema,
  ]);

  const stepBaseSchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    needs: z.array(z.string()).optional(),
    if: z.string().optional(),
    timeoutSeconds: z.number().nonnegative().optional(),
    onError: onErrorSchema.optional(),
  });

  const loopStepSchema = stepBaseSchema.extend({ execute: loopExecuteSchema });
  const nonLoopStepSchema = stepBaseSchema.extend({ execute: nonLoopExecuteSchema });

  return z.union([loopStepSchema, nonLoopStepSchema]).superRefine((data, ctx) => {
    if (data.execute.type === 'agent' && data.execute.structured !== undefined) {
      const structured = data.execute.structured;
      if (typeof structured !== 'object' || structured === null || Array.isArray(structured)) {
        ctx.addIssue({
          code: 'custom',
          message: 'structured must be an object',
          path: ['execute', 'structured'],
        });
      }
    }
  });
});

export const workflowDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  inputs: z.record(z.string(), inputDefSchema).optional(),
  steps: z.array(stepDefinitionSchema),
});

const legacyRetrySchema = z
  .object({
    max: z.number().optional(),
    strategy: retryStrategySchema.optional(),
    seconds: z.number().nonnegative().optional(),
  })
  .optional();

const rawOnErrorSchema = z.union([z.enum(['fail', 'skip', 'retry']), onErrorSchema]);

const normalizeRetryMax = (
  retry: { max?: number } | undefined,
  ctx: z.RefinementCtx,
  issueMessage: string,
  issuePath: ReadonlyArray<string | number>,
): number | undefined => {
  const max = retry?.max;
  if (max === undefined) {
    ctx.addIssue({ code: 'custom', message: issueMessage, path: [...issuePath] });
    return undefined;
  }
  if (!Number.isFinite(max)) {
    ctx.addIssue({
      code: 'custom',
      message: 'max must be a finite number',
      path: [...issuePath],
    });
    return undefined;
  }
  if (!Number.isInteger(max)) {
    ctx.addIssue({
      code: 'custom',
      message: 'max must be an integer',
      path: [...issuePath],
    });
    return undefined;
  }
  if (max < 1) {
    ctx.addIssue({
      code: 'custom',
      message: 'max must be >= 1',
      path: [...issuePath],
    });
    return undefined;
  }
  return max;
};

const normalizeOnError = (
  input: {
    onError: 'fail' | 'skip' | 'retry' | OnError | undefined;
    retry: { max?: number; strategy?: RetryStrategy; seconds?: number } | undefined;
  },
  ctx: z.RefinementCtx,
): OnError | undefined => {
  const { onError, retry } = input;

  if (onError !== undefined) {
    if (typeof onError === 'string') {
      if (retry !== undefined) {
        const max = normalizeRetryMax(retry, ctx, 'retry requires retry.max', ['retry', 'max']);
        if (max === undefined) {
          return undefined;
        }

        const normalized: OnError = {
          type: 'retry',
          max,
          final: onError === 'skip' ? 'skip' : 'fail',
        };
        if (retry.strategy !== undefined) {
          normalized.strategy = retry.strategy;
        }
        if (retry.seconds !== undefined) {
          normalized.seconds = retry.seconds;
        }
        return normalized;
      }

      if (onError === 'retry') {
        ctx.addIssue({
          code: 'custom',
          message: 'onError=retry requires retry.max',
          path: ['onError'],
        });
        return undefined;
      }

      return onError === 'fail' ? { type: 'fail' } : { type: 'skip' };
    }

    if (retry !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'retry cannot be used with onError object',
        path: ['retry'],
      });
      return undefined;
    }

    return onError;
  }

  if (retry !== undefined) {
    const max = normalizeRetryMax(retry, ctx, 'retry requires retry.max', ['retry', 'max']);
    if (max === undefined) {
      return undefined;
    }
    const normalized: OnError = { type: 'retry', max, final: 'fail' };
    if (retry.strategy !== undefined) {
      normalized.strategy = retry.strategy;
    }
    if (retry.seconds !== undefined) {
      normalized.seconds = retry.seconds;
    }
    return normalized;
  }

  return undefined;
};

export const workflowRawSchema: z.ZodType<WorkflowDefinition> = z.lazy(() => {
  const rawShellExecuteSchema = shellExecuteSchema.loose();
  const rawAgentExecuteSchema = agentExecuteSchema.loose();
  const rawSlackExecuteSchema = slackExecuteSchema.loose();

  const rawStepSchema = z.lazy((): z.ZodType<StepDefinition> => {
    const rawLoopExecuteSchema = z
      .object({
        type: z.literal('loop'),
        max: z.number().int().min(1),
        until: z.string().optional(),
        steps: z.array(rawStepSchema),
      })
      .loose();

    const rawExecuteSchema = z.discriminatedUnion('type', [
      rawShellExecuteSchema,
      rawAgentExecuteSchema,
      rawSlackExecuteSchema,
      rawLoopExecuteSchema,
    ]);

    const rawRepeatSchema = z.object({
      max: z.number().int().min(1),
      until: z.string().optional(),
      steps: z.array(rawStepSchema).optional(),
    });

    return z
      .object({
        id: z.string(),
        name: z.string().optional(),
        needs: z.array(z.string()).optional(),
        if: z.string().optional(),
        timeoutSeconds: z.number().nonnegative().optional(),
        onError: rawOnErrorSchema.optional(),
        retry: legacyRetrySchema,
        execute: rawExecuteSchema.optional(),
        repeat: rawRepeatSchema.optional(),
        steps: z.array(rawStepSchema).optional(),
      })
      .transform((raw, ctx) => {
        const onError = normalizeOnError(
          {
            onError: raw.onError,
            retry: raw.retry,
          },
          ctx,
        );

        const hasExecute = raw.execute !== undefined;
        const hasRepeat = raw.repeat !== undefined;
        const hasTopLevelSteps = raw.steps !== undefined;

        if (hasExecute && hasRepeat) {
          ctx.addIssue({
            code: 'custom',
            message: 'step cannot have both execute and repeat',
            path: [],
          });
          return z.NEVER;
        }

        if (!hasExecute && !hasRepeat) {
          ctx.addIssue({
            code: 'custom',
            message: 'step must have either execute or repeat',
            path: [],
          });
          return z.NEVER;
        }

        if (hasRepeat) {
          const repeat = raw.repeat;
          if (!repeat) {
            return z.NEVER;
          }

          if (repeat.steps !== undefined && hasTopLevelSteps) {
            ctx.addIssue({
              code: 'custom',
              message: 'repeat.steps cannot be used with top-level steps',
              path: ['repeat', 'steps'],
            });
            return z.NEVER;
          }

          const steps = repeat.steps ?? raw.steps;
          if (steps === undefined) {
            ctx.addIssue({
              code: 'custom',
              message: 'repeat requires repeat.steps or steps',
              path: ['repeat'],
            });
            return z.NEVER;
          }

          return stepDefinitionSchema.parse({
            id: raw.id,
            name: raw.name,
            needs: raw.needs,
            if: raw.if,
            timeoutSeconds: raw.timeoutSeconds,
            onError,
            execute: {
              type: 'loop',
              max: repeat.max,
              until: repeat.until,
              steps,
            },
          });
        }

        if (hasTopLevelSteps) {
          ctx.addIssue({
            code: 'custom',
            message: 'steps is not allowed; use execute.steps for loop blocks',
            path: ['steps'],
          });
          return z.NEVER;
        }

        const execute = raw.execute;
        if (!execute) {
          return z.NEVER;
        }

        if (execute.type !== 'loop' && 'steps' in execute) {
          ctx.addIssue({
            code: 'custom',
            message: 'execute.steps is only allowed when execute.type is loop',
            path: ['execute', 'steps'],
          });
          return z.NEVER;
        }

        if (execute.type === 'agent' && execute.structured !== undefined) {
          const structured = execute.structured;
          if (typeof structured !== 'object' || structured === null || Array.isArray(structured)) {
            ctx.addIssue({
              code: 'custom',
              message: 'structured must be an object',
              path: ['execute', 'structured'],
            });
            return z.NEVER;
          }
        }

        return stepDefinitionSchema.parse({
          id: raw.id,
          name: raw.name,
          needs: raw.needs,
          if: raw.if,
          timeoutSeconds: raw.timeoutSeconds,
          onError,
          execute,
        });
      });
  });

  return z
    .object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      inputs: z.record(z.string(), inputDefSchema).optional(),
      steps: z.array(rawStepSchema),
    })
    .transform((raw) => {
      const normalized: WorkflowDefinition = {
        id: raw.id,
        name: raw.name,
        description: raw.description,
        inputs: raw.inputs,
        steps: raw.steps,
      };
      return workflowDefinitionSchema.parse(normalized);
    });
});
