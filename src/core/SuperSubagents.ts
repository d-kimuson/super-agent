import { z } from 'zod';
import { AgentSdk } from '../agent-sdk/AgentSdk';
import { type FailedSession, type PausedSession } from '../agent-sdk/types';
import { type Context } from '../config/types';
import { composePrompt } from './composePrompt';
import { selectModel } from './selectModel';
import { stoppedSessionToResult } from './stoppedSessionToResult';
import { type ToolResult } from './types';

const agentTaskOutputSchema = z.object({
  sessionId: z.string(),
});

export const SuperSubagents = (context: Context) => {
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
    resume: z
      .string()
      .optional()
      .describe('Optional session ID to continue from a previous conversation'),
    runInBackground: z
      .boolean()
      .optional()
      .default(false)
      .describe('Whether to run the task in the background'),
  });

  const agentTask = async (input: z.infer<typeof agentTaskArgsSchema>): Promise<ToolResult> => {
    const matchAgent =
      agents.find(({ name }) => name === input.agentType) ??
      agents.find(({ name }) => name === 'general');

    if (matchAgent === undefined) {
      return {
        success: false,
        code: 'agent-not-found',
        message: `Agent not found: ${input.agentType}`,
      } as const;
    }

    // Select model with filtering and fallback
    const modelResult = selectModel({ agentModels: matchAgent.models, config });

    if (modelResult.code !== 'success') {
      return {
        success: false,
        code: 'agent-model-not-found',
        message: `No available model for agent "${input.agentType}". ${modelResult.message}`,
      } as const;
    }

    const selectedModel = modelResult.model;

    // Expand skills if specified
    const composedPrompt = composePrompt({
      agentPrompt: matchAgent.prompt,
      userInput: input.prompt,
      enabledSkills: skills.filter((skill) => matchAgent.skills.includes(skill.name)),
    });
    const sdk = AgentSdk();

    const result =
      input.resume === undefined
        ? await sdk.startSession({
            prompt: composedPrompt,
            cwd: process.cwd(),
            sdkType: selectedModel.sdkType,
            ...(selectedModel.model !== undefined && { model: selectedModel.model }),
          })
        : await sdk.resumeSession({
            ...selectedModel,
            prompt: composedPrompt,
            cwd: process.cwd(),
            sdkSessionId: input.resume,
          });

    if (result.code !== 'success') {
      return {
        success: false,
        code: 'failed-to-start-task',
        message: `Failed to start task: ${result.code}`,
      } as const;
    }

    if (input.runInBackground) {
      backgroundTaskMap.set(result.session.sdkSessionId, {
        promise: result.stopped,
      });

      return {
        success: true,
        sessionId: result.session.sdkSessionId,
        message: `Task started in background. Session ID: ${result.session.sdkSessionId}`,
      } as const;
    }

    // await completion
    const stopped = await result.stopped;
    return stoppedSessionToResult(stopped);
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
      } as const;
    }

    const stopped = await task.promise;
    return stoppedSessionToResult(stopped);
  };

  return {
    agentTaskArgsSchema,
    agentTask,
    agentTaskOutputSchema,
    agentTaskOutput,
  } as const;
};
