import { logger } from '../../../lib/logger';
import {
  type WorkflowDef,
  type StepDef,
  type WorkflowRun,
  type StepResult,
} from '../builder/types';
import { flags } from '../flags';
import { type ICtx } from '../types';
import { agentRunner } from './steps/agentRunner';
import { loopRunner } from './steps/loopRunner';
import { shellRunner } from './steps/shellRunner';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runStepWithTimeout = async <Ctx extends ICtx>(
  context: Ctx,
  def: StepDef<Ctx>,
  timeoutMs: number | undefined,
): Promise<StepResult> => {
  const stepPromise: Promise<StepResult> = runStepCore(context, def);

  if (timeoutMs === undefined) {
    return await stepPromise;
  }

  const timeoutPromise = new Promise<StepResult>((_, reject) => {
    setTimeout(() => reject(new Error('Step execution timeout')), timeoutMs);
  });

  return await Promise.race([stepPromise, timeoutPromise]);
};

const runStepCore = async <Ctx extends ICtx>(
  context: Ctx,
  def: StepDef<Ctx>,
): Promise<StepResult> => {
  switch (def.type) {
    case 'shell': {
      return await shellRunner(context, def);
    }
    case 'agent': {
      return await agentRunner(context, def);
    }
    case 'loop': {
      return await loopRunner(context, def, runStep);
    }
    default: {
      def satisfies never;
      throw new Error(`Unknown step type`);
    }
  }
};

const runStep = async <Ctx extends ICtx>(context: Ctx, def: StepDef<Ctx>): Promise<StepResult> => {
  const timeoutMs =
    def.timeoutSeconds !== undefined && def.timeoutSeconds > 0
      ? def.timeoutSeconds * 1000
      : undefined;

  if (!def.onError) {
    return await runStepWithTimeout(context, def, timeoutMs);
  }

  if (def.onError.type === 'skip') {
    try {
      return await runStepWithTimeout(context, def, timeoutMs);
    } catch (error) {
      logger.warn(`Step failed, skipping due to onError config: ${String(error)}`);
      return {
        status: 'skipped' as const,
      };
    }
  }

  if (def.onError.type === 'exit') {
    return await runStepWithTimeout(context, def, timeoutMs);
  }

  if (def.onError.type === 'retry') {
    let lastError: unknown;
    for (let attempt = 0; attempt < def.onError.attempts; attempt++) {
      try {
        return await runStepWithTimeout(context, def, timeoutMs);
      } catch (error) {
        lastError = error;
        logger.warn(
          `Step failed (attempt ${attempt + 1}/${def.onError.attempts}): ${String(error)}`,
        );

        if (attempt < def.onError.attempts - 1) {
          const delayMs =
            def.onError.strategy === 'backoff'
              ? def.onError.seconds * 1000 * Math.pow(2, attempt)
              : def.onError.seconds * 1000;
          logger.info(`Retrying in ${delayMs}ms...`);
          await sleep(delayMs);
        }
      }
    }
    throw lastError;
  }

  def.onError satisfies never;
  throw new Error('Unknown onError type');
};

const safeParse = <T>(parseFn: () => T) => {
  try {
    return {
      success: true,
      value: parseFn(),
    };
  } catch (error) {
    return {
      success: false,
      error,
    };
  }
};

export const workflowRun =
  <const Ctx extends ICtx>(workflow: WorkflowDef<Ctx>): WorkflowRun<Ctx> =>
  async (rawInput) => {
    const validateResult = safeParse(
      async () => await workflow.inputSchema['~standard'].validate(rawInput),
    );

    if (validateResult.success === false) {
      return {
        success: false,
        code: 'validation-error',
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const context = {
      rawInput,
      input: validateResult.value,
      steps: {},
      flags,
    } as unknown as Ctx;

    const stepResults: { name: string; result: StepResult }[] = [];

    for (const { name, def } of workflow.steps) {
      logger.info(`Running step ${name}`);
      try {
        const result = await runStep(context, def);

        if (result.status === 'skipped') {
          logger.info(`Step ${name} skipped`);
          context.steps[name] = result;
          stepResults.push({ name, result });
          if (def.mutateStateAfterStep) {
            Object.assign(context, def.mutateStateAfterStep(context));
          }
          continue;
        }

        if (result.status === 'success') {
          logger.info(`Step ${name} succeeded, ${JSON.stringify(result.output)}`);
          context.steps[name] = result;
          stepResults.push({ name, result });
          if (def.mutateStateAfterStep) {
            Object.assign(context, def.mutateStateAfterStep(context));
          }
          continue;
        }

        if (result.status === 'failed') {
          logger.error(`Step ${name} failed: ${String(result.error)}`);
          context.steps[name] = result;
          stepResults.push({ name, result });
          if (def.mutateStateAfterStep) {
            Object.assign(context, def.mutateStateAfterStep(context));
          }
          return {
            success: false,
            code: 'step-error',
            error: result.error,
          };
        }
      } catch (error) {
        return {
          success: false,
          code: 'step-error',
          error,
        };
      }
    }

    return {
      success: true,
      steps: stepResults,
    };
  };
