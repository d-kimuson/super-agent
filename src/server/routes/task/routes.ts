import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { composePrompt } from '../../../config/composePrompt';
import { expandSkills } from '../../../config/expandSkills';
import { AgentBridge } from '../../../core/AgentBridge';
import { type AgentModel, type FailedSession, type PausedSession } from '../../../core/types';
import { type HonoContext } from '../../hono/app';

type TaskResult =
  | {
      success: true;
      response: string;
      sessionId: string;
    }
  | {
      success: false;
      response: string;
      sessionId: string;
    };

const errorToString = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const stoppedSessionToResponse = (session: PausedSession | FailedSession): TaskResult => {
  const sessionId = session.sdkSessionId ?? '';
  const resumeMessage = sessionId
    ? `To continue the conversation, use the 'agent-task' tool again with the resume=${sessionId}.`
    : '';

  if (session.status === 'paused') {
    if (session.currentTurn.status === 'completed') {
      return {
        success: true,
        response: session.currentTurn.output + '\n\n---\n\n' + resumeMessage,
        sessionId,
      } as const;
    } else {
      return {
        success: false,
        response: errorToString(session.currentTurn.error) + '\n\n---\n\n' + resumeMessage,
        sessionId,
      } as const;
    }
  }

  return {
    success: false,
    response: errorToString(session.error) + '\n\n---\n\n' + resumeMessage,
    sessionId,
  } as const;
};

const agentTaskSchema = z.object({
  agentType: z.string(),
  prompt: z.string(),
  resume: z.string().optional(),
  runInBackground: z.boolean().optional().default(false),
});

const agentTaskOutputSchema = z.object({
  sessionId: z.string(),
});

export const tasksRoute = () => {
  const backgroundTaskMap = new Map<
    string,
    {
      promise: Promise<PausedSession | FailedSession>;
    }
  >();

  return (
    new Hono<HonoContext>()
      // POST /task/execute
      .post('/execute', zValidator('json', agentTaskSchema), async (c) => {
        const input = c.req.valid('json');
        const { config } = c.var;

        const matchAgent = config.agents.find(({ name }) => name === input.agentType);

        if (matchAgent === undefined) {
          return c.json({ error: `Agent type not found: ${input.agentType}` }, 404);
        }

        const selectedModel = matchAgent.agents.at(0) as AgentModel | undefined;

        if (selectedModel === undefined) {
          return c.json({ error: `Agent model not found: ${input.agentType}` }, 404);
        }

        // Expand skills if specified
        const skillsPrompt =
          matchAgent.skills.length > 0 ? expandSkills(config.skills, matchAgent.skills) : '';

        const composedPrompt = composePrompt(
          skillsPrompt ? `${matchAgent.prompt}\n\n${skillsPrompt}` : matchAgent.prompt,
          input.prompt,
        );
        const bridge = AgentBridge();

        const result =
          input.resume === undefined
            ? await bridge.startSession({
                prompt: composedPrompt,
                cwd: process.cwd(),
                sdkType: selectedModel.sdkType,
                ...(selectedModel.model !== undefined && { model: selectedModel.model }),
              })
            : await bridge.resumeSession({
                ...selectedModel,
                prompt: composedPrompt,
                cwd: process.cwd(),
                sdkSessionId: input.resume,
              });

        if (result.code !== 'success') {
          return c.json({ error: `Failed to start task: ${result.code}` }, 500);
        }

        if (input.runInBackground) {
          backgroundTaskMap.set(result.session.sdkSessionId, {
            promise: result.stopped,
          });

          return c.json({
            sessionId: result.session.sdkSessionId,
            message: 'Task started in background',
          });
        }

        // await completion
        const stopped = await result.stopped;
        const taskResult = stoppedSessionToResponse(stopped);

        return c.json(taskResult);
      })
      // POST /task/output
      .post('/output', zValidator('json', agentTaskOutputSchema), async (c) => {
        const input = c.req.valid('json');

        const task = backgroundTaskMap.get(input.sessionId);

        if (task === undefined) {
          return c.json({ error: `Background task not found: ${input.sessionId}` }, 404);
        }

        // Wait for completion
        const stopped = await task.promise;
        const taskResult = stoppedSessionToResponse(stopped);

        // Remove from map after completion
        backgroundTaskMap.delete(input.sessionId);

        return c.json(taskResult);
      })
  );
};
