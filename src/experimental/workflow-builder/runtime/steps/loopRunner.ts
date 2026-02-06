import { type LoopStepDef, type StepResult, type StepDef } from '../../builder/types';
import { BreakFlag, ContinueFlag } from '../../flags';
import { type ICtx } from '../../types';

export const loopRunner = async <Ctx extends ICtx>(
  ctx: Ctx,
  def: LoopStepDef<Ctx>,
  runStep: (ctx: Ctx, def: StepDef<Ctx>) => Promise<StepResult>,
): Promise<StepResult> => {
  const results = [];
  while (true) {
    const condition = await def.condition(ctx);
    if (condition instanceof BreakFlag) {
      break;
    }
    if (!(condition instanceof ContinueFlag)) {
      return {
        status: 'failed',
        error: new Error('Loop condition must return continue or break flag'),
      };
    }

    for (const stepDef of def.steps) {
      const result = await runStep(ctx, stepDef);
      results.push(result);

      if (result.status === 'failed') {
        return {
          status: 'failed',
          error: result.error,
        };
      }
    }
  }

  return {
    status: 'success',
    output: results,
  };
};
