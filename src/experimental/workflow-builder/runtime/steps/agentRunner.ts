import { AgentSdk } from '../../../../agent-sdk/AgentSdk';
import { type AgentStepDef, type StepResult } from '../../builder/types';
import { SkipFlag } from '../../flags';
import { type ICtx } from '../../types';

export const agentRunner = async <Ctx extends ICtx>(
  ctx: Ctx,
  def: AgentStepDef<Ctx>,
): Promise<StepResult> => {
  const prompt = await def.prompt(ctx);
  if (prompt instanceof SkipFlag) {
    return {
      status: 'skipped',
    } satisfies StepResult;
  }

  const result = await AgentSdk().startSession({
    sdkType: def.sdkType,
    model: def.model,
    prompt,
    cwd: process.cwd(),
    outputSchema: def.structured,
  });

  const stopped = await result.stopped;

  if (stopped.status === 'failed') {
    return {
      status: 'failed',
      error: stopped.error,
    };
  }

  if (stopped.currentTurn.status === 'failed') {
    return {
      status: 'failed',
      error: stopped.currentTurn.error,
    };
  }

  return {
    status: 'success',
    output: {
      // eslint-disable-next-line no-deprecated
      structured: stopped.currentTurn.structuredOutput,
    },
  };
};
