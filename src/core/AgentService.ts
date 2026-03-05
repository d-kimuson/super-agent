import { type StandardJSONSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';
import { AgentSdk } from '../agent-sdk/AgentSdk';
import { type FailedSession, type PausedSession } from '../agent-sdk/types';
import { type AgentModel } from '../config/schema';
import { type CliContext } from '../config/types';
import { type InferStandardJSONSchema } from '../lib/types';
import { composePrompt } from './composePrompt';
import { selectModel } from './selectModel';
import { stoppedSessionToResult } from './stoppedSessionToResult';
import { type ToolResult } from './types';

type AgentTaskRawResult =
  | { success: true; sessionId: string; sdkType: AgentModel['sdkType']; output: string }
  | { success: false; code: string; message: string; sessionId?: string };

type ResolveAgentSuccess = {
  ok: true;
  prompt: string;
  model: AgentModel;
};

type ToolError = Extract<ToolResult<unknown>, { status: 'failed' }>;

type ResolveAgentFailure = {
  ok: false;
  error: ToolError;
};

type ResolveAgentResult = ResolveAgentSuccess | ResolveAgentFailure;

type AgentTaskArgs<O extends StandardJSONSchemaV1 | undefined> = {
  agentType?: string;
  prompt: string;
  cwd: string;
  resume?: string;
  runInBackground?: boolean;
  disabledSdkTypes?: AgentModel['sdkType'][];
  outputSchema?: O;
};

type AgentTaskOutputArgs = {
  sessionId: string;
};

export const AgentService = (context: CliContext) => {
  const { agents, skills, config } = context;

  const backgroundTaskMap = new Map<
    string,
    {
      promise: Promise<PausedSession | FailedSession>;
    }
  >();

  const agentNames = agents.map((agent) => agent.name);

  const agentTypeSchema = z.enum(agentNames).optional().describe('The agent to use for this task');

  const resolveAgent = <const O extends StandardJSONSchemaV1 | undefined>(
    input: AgentTaskArgs<O>,
  ): ResolveAgentResult => {
    const matchAgent =
      agents.find(({ name }) => name === input.agentType) ??
      agents.find(({ name }) => name === 'general');

    if (matchAgent === undefined) {
      return {
        ok: false,
        error: {
          status: 'failed',
          code: 'agent-not-found',
          message: `Agent not found: ${input.agentType}`,
        },
      } as const;
    }

    const modelResult = selectModel({
      agentModels: matchAgent.models,
      config,
      disabledSdkTypes: input.disabledSdkTypes ?? [],
    });

    if (modelResult.code !== 'success') {
      return {
        ok: false,
        error: {
          status: 'failed',
          code: 'agent-model-not-found',
          message: `No available model for agent "${input.agentType}". ${modelResult.message}`,
        },
      } as const;
    }

    const composedPrompt = composePrompt({
      agentPrompt: matchAgent.prompt,
      userInput: input.prompt,
      enabledSkills: skills.filter((skill) => matchAgent.skills.includes(skill.name)),
    });

    return {
      ok: true,
      prompt: composedPrompt,
      model: modelResult.model,
    } as const;
  };

  const agentTask = async <
    const O extends StandardJSONSchemaV1 | undefined,
    StructuredOutput extends { raw: unknown; parsed: unknown } = O extends StandardJSONSchemaV1
      ? InferStandardJSONSchema<O>
      : { raw: unknown; parsed: unknown },
  >(
    input: AgentTaskArgs<O>,
  ): Promise<ToolResult<StructuredOutput['parsed']>> => {
    const resolved = resolveAgent(input);
    if (resolved.ok === false) {
      return {
        status: 'failed',
        code: resolved.error.code,
        message: resolved.error.message,
        sessionId: resolved.error.sessionId,
      };
    }

    const sdk = AgentSdk();
    const selectedModel = resolved.model;

    const result =
      input.resume === undefined
        ? await sdk.startSession({
            prompt: resolved.prompt,
            cwd: input.cwd,
            sdkType: selectedModel.sdkType,
            ...(selectedModel.model !== undefined && { model: selectedModel.model }),
          })
        : await sdk.resumeSession({
            ...selectedModel,
            prompt: resolved.prompt,
            cwd: input.cwd,
            sdkSessionId: input.resume,
          });

    if (result.code !== 'success') {
      return {
        status: 'failed',
        code: result.code,
        message: `Failed to start task: ${result.code}`,
      };
    }

    // timeout した際に agentTaskOutput で取り出せるように runInBackground でなくとも
    // 追加しておく
    backgroundTaskMap.set(result.session.sdkSessionId, {
      promise: result.stopped,
    });

    if (input.runInBackground ?? false) {
      return {
        status: 'run-in-background',
        sessionId: result.session.sdkSessionId,
        message: `Task started in background. Resolved Sdk Type: ${result.session.sdkType}. Session ID: ${result.session.sdkSessionId}`,
        sdkType: result.session.sdkType,
      };
    }

    const stopped = await result.stopped;
    return stoppedSessionToResult(stopped);
  };

  const agentTaskOutput = async (input: AgentTaskOutputArgs): Promise<ToolResult<unknown>> => {
    const task = backgroundTaskMap.get(input.sessionId);
    if (task === undefined) {
      return {
        status: 'failed',
        code: 'task-not-found',
        message: `Task not found: ${input.sessionId}`,
      };
    }

    const stopped = await task.promise;
    return stoppedSessionToResult(stopped);
  };

  return {
    agentTypeSchema,
    agentTask,
    agentTaskOutput,
  };
};

export type { AgentTaskRawResult };
