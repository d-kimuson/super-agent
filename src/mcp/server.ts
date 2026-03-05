import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import packageJson from '../../package.json' with { type: 'json' };
import { providersSchema } from '../config/schema';
import { type CliContext } from '../config/types';
import { AgentService } from '../core/AgentService';
import { errorToString } from '../lib/errorToString';
import { mapToolResultToMcpResponse } from '../lib/mapToolResultToMcpResponse';

export const createServer = (context: CliContext) => {
  const server = new McpServer({
    name: packageJson.name,
    version: packageJson.version,
  });

  const agentDescriptions = context.agents
    .map((agent) => `- ${agent.name}: ${agent.description}`)
    .join('\n');

  const agentService = AgentService(context);

  server.registerTool(
    'agent-task',
    {
      description: `Execute a task using a configured AI agent.\n\nAvailable agents:\n${agentDescriptions}\n\nThe agent will execute the prompt and return the result. If sessionId is provided, it will continue from the previous session.`,
      inputSchema: z.object({
        agentType: agentService.agentTypeSchema,
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
      }),
    },
    async (input) => {
      try {
        const result = await agentService.agentTask(input);
        return mapToolResultToMcpResponse(result);
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: errorToString(error),
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    'agent-task-output',
    {
      description: `Retrieve the output of a background agent task by session ID.\n\nIMPORTANT: This tool waits for the task to complete and returns the final output. It does NOT return partial or in-progress output. The tool will block until the task finishes.\n\nUse this tool after starting a task with runInBackground=true to get the final result.`,
      inputSchema: z.object({
        sessionId: z.string(),
      }),
    },
    async (input) => {
      try {
        const result = await agentService.agentTaskOutput(input);
        return mapToolResultToMcpResponse(result);
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: errorToString(error),
            },
          ],
        };
      }
    },
  );

  return server;
};

export const startServer = async (context: CliContext) => {
  const server = createServer(context);
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
