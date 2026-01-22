import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import packageJson from '../../package.json' with { type: 'json' };
import { honoClient } from '../client';
import { type Config } from '../config/types';
import { ensureServer } from '../server/management/ensureServer';
import { getState } from '../state';

const getClient = async () => {
  await ensureServer();
  const state = getState();
  if (!state.server || state.server.status !== 'running') {
    throw new Error('Server is not running');
  }
  return honoClient(state.server.port);
};

export const createServer = (config: Config) => {
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

  server.registerTool(
    'agent-task',
    {
      description: `Execute a task using a configured AI agent.\n\nAvailable agents:\n${agentDescriptions}\n\nThe agent will execute the prompt and return the result. If sessionId is provided, it will continue from the previous session.`,
      inputSchema: agentTaskArgsSchema,
    },
    async (input) => {
      try {
        const client = await getClient();
        const response = await client.task.execute.$post({
          json: {
            agentType: input.agentType,
            prompt: input.prompt,
            resume: input.resume,
            runInBackground: input.runInBackground,
          },
        });

        const data = await response.json();

        // Background task の場合
        if ('sessionId' in data && 'message' in data) {
          return {
            content: [
              {
                type: 'text',
                text: `Task started in background. Session ID: ${data.sessionId}`,
              },
            ],
          };
        }

        // 通常のレスポンス
        if ('success' in data) {
          return {
            isError: !data.success,
            content: [
              {
                type: 'text',
                text: data.response,
              },
            ],
          };
        }

        // エラーレスポンス
        if ('error' in data) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: data.error,
              },
            ],
          };
        }

        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Unknown response format',
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: error instanceof Error ? error.message : String(error),
            },
          ],
        };
      }
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
      try {
        const client = await getClient();
        const response = await client.task.output.$post({
          json: {
            sessionId: input.sessionId,
          },
        });

        const data = await response.json();

        if ('success' in data) {
          return {
            isError: !data.success,
            content: [
              {
                type: 'text',
                text: data.response,
              },
            ],
          };
        }

        if ('error' in data) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: data.error,
              },
            ],
          };
        }

        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Unknown response format',
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: error instanceof Error ? error.message : String(error),
            },
          ],
        };
      }
    },
  );

  return server;
};

export const startServer = async (config: Config) => {
  await ensureServer();

  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
