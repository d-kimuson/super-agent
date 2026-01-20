import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import packageJson from '../../package.json' with { type: 'json' };
import { AgentBridge } from '../core/AgentBridge';
import { type AgentModel, type FailedSession, type PausedSession } from '../core/types';
import { composePrompt } from './composePrompt';
import { type Config } from './types';

type TaskResult =
  | {
      success: true;
      response: string;
    }
  | {
      success: false;
      response: string;
    };

export const createServer = (config: Config) => {
  const bridge = AgentBridge();
  const backgroundTaskMap = new Map<
    string,
    {
      promise: Promise<PausedSession | FailedSession>;
    }
  >();

  const server = new McpServer({
    name: packageJson.name,
    version: packageJson.version,
  });

  const agentNames = config.agents.map((agent) => agent.name);
  const agentDescriptions = config.agents
    .map((agent) => {
      const primaryAgentConfig = agent.agents[0];
      if (primaryAgentConfig === undefined) {
        return undefined;
      }
      const modelInfo =
        primaryAgentConfig.model !== undefined ? ` (${primaryAgentConfig.model})` : '';
      return `- ${agent.name}: ${agent.description} [${primaryAgentConfig.sdkType}${modelInfo}]`;
    })
    .filter((desc): desc is string => desc !== undefined)
    .join('\n');

  const agentTaskArgsSchema = z.object({
    agentType: z.enum(agentNames).describe('The agent to use for this task'),
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

  const errorToString = (error: unknown) => {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  };

  const stoppedSessionToResponse = (session: PausedSession | FailedSession): TaskResult => {
    const resumeMessage = `To continue the conversation, use the 'agent-task' tool again with the resume=${session.sdkSessionId}.`;

    if (session.status === 'paused') {
      if (session.currentTurn.status === 'completed') {
        return {
          success: true,
          response: session.currentTurn.output + '\n\n---\n\n' + resumeMessage,
        } as const;
      } else {
        return {
          success: false,
          response: errorToString(session.currentTurn.error) + '\n\n---\n\n' + resumeMessage,
        } as const;
      }
    }

    return {
      success: false,
      response: errorToString(session.error) + '\n\n---\n\n' + resumeMessage,
    } as const;
  };

  server.registerTool(
    'agent-task',
    {
      description: `Execute a task using a configured AI agent.\n\nAvailable agents:\n${agentDescriptions}\n\nThe agent will execute the prompt and return the result. If sessionId is provided, it will continue from the previous session.`,
      inputSchema: agentTaskArgsSchema,
    },
    async (input) => {
      const matchAgent = config.agents.find(({ name }) => name === input.agentType);

      if (matchAgent === undefined) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Agent type not found: ${input.agentType}`,
            },
          ],
        };
      }

      const selectedModel = matchAgent.agents.at(0) as AgentModel | undefined;

      if (selectedModel === undefined) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Agent model not found: ${input.agentType}`,
            },
          ],
        };
      }

      const composedPrompt = composePrompt(matchAgent.prompt, input.prompt);

      const result =
        input.resume === undefined
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
              sdkSessionId: input.resume,
            });

      if (result.code !== 'success') {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Failed to start task: ${result.code}`,
            },
          ],
        };
      }

      if (input.runInBackground) {
        backgroundTaskMap.set(result.session.sdkSessionId, {
          promise: result.stopped,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Task started in background. Session ID: ${result.session.sdkSessionId}`,
            },
          ],
        };
      }

      // await completion
      const stopped = await result.stopped;
      const taskResult = stoppedSessionToResponse(stopped);

      return {
        isError: !taskResult.success,
        content: [
          {
            type: 'text',
            text: taskResult.response,
          },
        ],
      } as const;
    },
  );

  const agentTaskOutputArgsSchema = z.object({
    sessionId: z.string().describe('The session ID of the background task to retrieve output from'),
  });

  server.registerTool(
    'agent-task-output',
    {
      description: `Retrieve the output of a background agent task by session ID.\n\nIMPORTANT: This tool waits for the task to complete and returns the final output. It does NOT return partial or in-progress output. The tool will block until the task finishes.\n\nUse this tool after starting a task with runInBackground=true to get the final result.`,
      inputSchema: agentTaskOutputArgsSchema,
    },
    async (input) => {
      const task = backgroundTaskMap.get(input.sessionId);

      if (task === undefined) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Background task not found: ${input.sessionId}`,
            },
          ],
        };
      }

      // Wait for completion
      const stopped = await task.promise;
      const taskResult = stoppedSessionToResponse(stopped);

      // Remove from map after completion
      backgroundTaskMap.delete(input.sessionId);

      return {
        isError: !taskResult.success,
        content: [
          {
            type: 'text',
            text: taskResult.response,
          },
        ],
      } as const;
    },
  );

  return server;
};

export const startServer = async (config: Config) => {
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
