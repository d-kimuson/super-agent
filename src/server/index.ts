import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { AgentBridge } from '../core/AgentBridge';
import { type AgentModel, type FailedSession, type PausedSession } from '../core/types';
import { composePrompt } from '../mcp/composePrompt';
import { type Config } from '../mcp/types';

type TaskResult =
  | {
      success: true;
      response: string;
      sessionId: string;
    }
  | {
      success: false;
      error: string;
      sessionId?: string;
    };

const errorToString = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const stoppedSessionToResponse = (session: PausedSession | FailedSession): TaskResult => {
  if (session.status === 'paused') {
    if (session.currentTurn.status === 'completed') {
      return {
        success: true,
        response: session.currentTurn.output,
        sessionId: session.sdkSessionId,
      };
    }
    return {
      success: false,
      error: errorToString(session.currentTurn.error),
      sessionId: session.sdkSessionId,
    };
  }

  return {
    success: false,
    error: errorToString(session.error),
    sessionId: session.sdkSessionId,
  };
};

export type CreateServerOptions = {
  config: Config;
};

export const createApp = (options: CreateServerOptions) => {
  const { config } = options;
  const bridge = AgentBridge();
  const backgroundTaskMap = new Map<
    string,
    {
      promise: Promise<PausedSession | FailedSession>;
    }
  >();

  const app = new Hono();

  // Health check
  app.get('/health', (c) => {
    return c.json({ status: 'ok' });
  });

  // List available agents
  app.get('/agents', (c) => {
    const agents = config.agents.map((agent) => ({
      name: agent.name,
      description: agent.description,
      models: agent.agents.map((m) => ({
        sdkType: m.sdkType,
        model: m.model,
      })),
    }));
    return c.json({ agents });
  });

  // List available skills
  app.get('/skills', (c) => {
    const skills = config.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
    return c.json({ skills });
  });

  // Get skill prompt
  app.get('/skills/:name', (c) => {
    const skillName = c.req.param('name');
    const skill = config.skills.find((s) => s.name === skillName);

    if (skill === undefined) {
      return c.json({ error: `Skill not found: ${skillName}` }, 404);
    }

    return c.json({
      name: skill.name,
      description: skill.description,
      prompt: skill.prompt,
    });
  });

  // Execute agent task
  app.post('/tasks', async (c) => {
    const body = await c.req.json<{
      agentType: string;
      prompt: string;
      resume?: string;
      runInBackground?: boolean;
    }>();

    const matchAgent = config.agents.find(({ name }) => name === body.agentType);

    if (matchAgent === undefined) {
      return c.json({ error: `Agent type not found: ${body.agentType}` }, 400);
    }

    const selectedModel = matchAgent.agents.at(0) as AgentModel | undefined;

    if (selectedModel === undefined) {
      return c.json({ error: `Agent model not found: ${body.agentType}` }, 400);
    }

    const composedPrompt = composePrompt(matchAgent.prompt, body.prompt);

    const result =
      body.resume === undefined
        ? await bridge.startSession({
            prompt: composedPrompt,
            cwd: process.cwd(),
            model: selectedModel.model,
            sdkType: selectedModel.sdkType,
          })
        : await bridge.resumeSession({
            ...selectedModel,
            prompt: composedPrompt,
            cwd: process.cwd(),
            sdkSessionId: body.resume,
          });

    if (result.code !== 'success') {
      return c.json({ error: `Failed to start task: ${result.code}` }, 500);
    }

    if (body.runInBackground === true) {
      backgroundTaskMap.set(result.session.sdkSessionId, {
        promise: result.stopped,
      });

      return c.json({
        status: 'started',
        sessionId: result.session.sdkSessionId,
      });
    }

    // Wait for completion
    const stopped = await result.stopped;
    const taskResult = stoppedSessionToResponse(stopped);

    if (taskResult.success) {
      return c.json({
        success: true,
        response: taskResult.response,
        sessionId: taskResult.sessionId,
      });
    }

    return c.json(
      {
        success: false,
        error: taskResult.error,
        sessionId: taskResult.sessionId,
      },
      500,
    );
  });

  // Get background task output
  app.get('/tasks/:sessionId', async (c) => {
    const sessionId = c.req.param('sessionId');
    const task = backgroundTaskMap.get(sessionId);

    if (task === undefined) {
      return c.json({ error: `Background task not found: ${sessionId}` }, 404);
    }

    // Wait for completion
    const stopped = await task.promise;
    const taskResult = stoppedSessionToResponse(stopped);

    // Remove from map after completion
    backgroundTaskMap.delete(sessionId);

    if (taskResult.success) {
      return c.json({
        success: true,
        response: taskResult.response,
        sessionId: taskResult.sessionId,
      });
    }

    return c.json(
      {
        success: false,
        error: taskResult.error,
        sessionId: taskResult.sessionId,
      },
      500,
    );
  });

  return app;
};

export type StartServerOptions = CreateServerOptions & {
  port?: number;
  hostname?: string;
};

export const startServer = (options: StartServerOptions) => {
  const app = createApp(options);
  const port = options.port ?? 3000;
  const hostname = options.hostname ?? '127.0.0.1';

  const server = serve({
    fetch: app.fetch,
    port,
    hostname,
  });

  return { app, server };
};
