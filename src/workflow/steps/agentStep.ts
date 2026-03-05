import { type StandardJSONSchemaV1 } from '@standard-schema/spec';
import { AgentSdk } from '../../agent-sdk/AgentSdk';
import { type AgentModel, type SdkType } from '../../agent-sdk/types';
import { type CliContext } from '../../config/types';
import { AgentService } from '../../core/AgentService';
import { type InferStandardJSONSchema } from '../../lib/types';

export const agentStep =
  (ctx: CliContext) =>
  async <
    const StructuredSchema extends StandardJSONSchemaV1,
    StructuredOutput extends { raw: unknown; parsed: unknown } =
      InferStandardJSONSchema<StructuredSchema>,
  >(input: {
    prompt: string;
    agentType?: string;
    cwd?: string;
    resume?: string;
    disabledSdkTypes?: AgentModel['sdkType'][];
    outputSchema?: StructuredSchema
  }): Promise<
    | {
        status: 'success';
        output: string;
        structured: StructuredOutput['parsed'];
      }
    | {
        status: 'failed';
        code: 'timeout' | 'agent_error' | 'structured_validation_error' | 'runtime_error';
      }
  > => {
    try {
      const agentService = AgentService(ctx);

      const result = await agentService.agentTask({
        prompt: input.prompt,
        agentType: input.agentType,
        cwd: input.cwd ?? process.cwd(),
        resume: input.resume,
        runInBackground: false,
        disabledSdkTypes: input.disabledSdkTypes,
      });

      if (result.status === 'failed') {
        return {
          status: 'failed',
          code: 'agent_error',
          message: result.message,
        };
      }

      result.

      const stopped = await result.stopped;

      if (stopped.status === 'failed') {
        return {
          status: 'failed',
          code: 'agent_error',
        };
      }

      if (stopped.currentTurn.status === 'failed') {
        return {
          status: 'failed',
          code: 'agent_error',
        };
      }

      //
      const structuredOutput = stopped.currentTurn.structuredOutput;

      return {
        status: 'success',
        output: stopped.currentTurn.output,
        structured: structuredOutput as StructuredOutput['parsed'],
      };
    } catch {
      return {
        status: 'failed',
        code: 'runtime_error',
      };
    }
  };
