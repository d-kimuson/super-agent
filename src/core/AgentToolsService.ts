import { z } from 'zod';
import { AgentSdk } from '../agent-sdk/AgentSdk';
import { type FailedSession, type PausedSession } from '../agent-sdk/types';
import { type AgentModel, providersSchema } from '../config/schema';
import { type Context } from '../config/types';
import { composePrompt } from './composePrompt';
import { selectModel } from './selectModel';
import { stoppedSessionToResult } from './stoppedSessionToResult';
import { type ToolResult } from './types';

const agentTaskOutputSchema = z.object({
  sessionId: z.string(),
});

type AgentTaskRawResult =
  | { success: true; sessionId: string; sdkType: AgentModel['sdkType']; output: string }
  | { success: false; code: string; message: string; sessionId?: string };

type ResolveAgentSuccess = {
  ok: true;
  prompt: string;
  model: AgentModel;
};

type ToolError = Extract<ToolResult, { success: false }>;

type ResolveAgentFailure = {
  ok: false;
  error: ToolError;
};

type ResolveAgentResult = ResolveAgentSuccess | ResolveAgentFailure;

type StartSessionSuccess = {
  ok: true;
  session: { sdkSessionId: string; sdkType: AgentModel['sdkType'] };
  stopped: Promise<PausedSession | FailedSession>;
};

type StartSessionFailure = {
  ok: false;
  error: ToolError;
};

type StartSessionResult = StartSessionSuccess | StartSessionFailure;

export const AgentToolsService = (context: Context) => {
  const { agents, skills, config } = context;

  const backgroundTaskMap = new Map<
    string,
    {
      promise: Promise<PausedSession | FailedSession>;
    }
  >();

  const agentNames = agents.map((agent) => agent.name);

  const agentTaskArgsSchema = z.object({
    agentType: z.enum(agentNames).optional().describe('The agent to use for this task'),
    prompt: z.string().describe('The instruction/prompt for the agent'),
    cwd: z.string().describe('The working directory for the agent'),
    resume: z
      .string()
      .optional()
      .describe('Optional session ID to continue from a previous conversation'),
    runInBackground: z
      .boolean()
      .optional()
      .default(false)
      .describe('Whether to run the task in the background'),
    disabledSdkTypes: z
      .array(providersSchema)
      .optional()
      .describe(
        'SDK types to exclude from selection. Useful for falling back to other providers when encountering rate limits or network errors',
      ),
  });

  const resolveAgent = (input: z.infer<typeof agentTaskArgsSchema>): ResolveAgentResult => {
    const matchAgent =
      agents.find(({ name }) => name === input.agentType) ??
      agents.find(({ name }) => name === 'general');

    if (matchAgent === undefined) {
      return {
        ok: false,
        error: {
          success: false,
          code: 'agent-not-found',
          message: `Agent not found: ${input.agentType}`,
        },
      };
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
          success: false,
          code: 'agent-model-not-found',
          message: `No available model for agent "${input.agentType}". ${modelResult.message}`,
        },
      };
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
    };
  };

  const startSession = async (
    input: z.infer<typeof agentTaskArgsSchema>,
  ): Promise<StartSessionResult> => {
    const resolved = resolveAgent(input);
    if (!resolved.ok) {
      return resolved;
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
        ok: false,
        error: {
          success: false,
          code: 'failed-to-start-task',
          message: `Failed to start task: ${result.code}`,
        },
      };
    }

    return {
      ok: true,
      session: {
        sdkSessionId: result.session.sdkSessionId,
        sdkType: result.session.sdkType,
      },
      stopped: result.stopped,
    };
  };

  const agentTask = async (input: z.infer<typeof agentTaskArgsSchema>): Promise<ToolResult> => {
    const started = await startSession(input);
    if (!started.ok) {
      return {
        success: false,
        code: started.error.code,
        message: started.error.message,
        sessionId: started.error.sessionId,
      };
    }

    if (input.runInBackground) {
      backgroundTaskMap.set(started.session.sdkSessionId, {
        promise: started.stopped,
      });

      return {
        success: true,
        sessionId: started.session.sdkSessionId,
        message: `Task started in background. Session ID: ${started.session.sdkSessionId}`,
        sdkType: started.session.sdkType,
      };
    }

    const stopped = await started.stopped;
    return stoppedSessionToResult(stopped);
  };

  const agentTaskRaw = async (
    input: z.infer<typeof agentTaskArgsSchema>,
  ): Promise<AgentTaskRawResult> => {
    if (input.runInBackground) {
      return {
        success: false,
        code: 'background-not-supported',
        message: 'agentTaskRaw does not support background execution',
      };
    }

    const started = await startSession(input);
    if (!started.ok) {
      return {
        success: false,
        code: started.error.code,
        message: started.error.message,
        sessionId: started.error.sessionId,
      };
    }

    const stopped = await started.stopped;
    const sessionId = stopped.sdkSessionId ?? '';
    if (stopped.status === 'paused') {
      if (stopped.currentTurn.status === 'completed') {
        return {
          success: true,
          sessionId,
          sdkType: stopped.sdkType,
          output: stopped.currentTurn.output,
        };
      }
      return {
        success: false,
        code: 'turn-failed',
        message: String(stopped.currentTurn.error),
        sessionId,
      };
    }

    return {
      success: false,
      code: 'session-failed',
      message: String(stopped.error),
      sessionId,
    };
  };

  const agentTaskOutput = async (
    input: z.infer<typeof agentTaskOutputSchema>,
  ): Promise<ToolResult> => {
    const task = backgroundTaskMap.get(input.sessionId);
    if (task === undefined) {
      return {
        success: false,
        code: 'task-not-found',
        message: `Task not found: ${input.sessionId}`,
      };
    }

    const stopped = await task.promise;
    return stoppedSessionToResult(stopped);
  };

  return {
    agentTaskArgsSchema,
    agentTask,
    agentTaskRaw,
    agentTaskOutputSchema,
    agentTaskOutput,
  };
};

export type { AgentTaskRawResult };
