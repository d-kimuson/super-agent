import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import packageJson from '../../package.json' with { type: 'json' };
import { type Context } from '../config/types';
import { SuperSubagents } from '../core/SuperSubagents';
import { errorToString } from '../lib/errorToString';
import { mapToolResultToMcpResponse } from '../lib/mapToolResultToMcpResponse';

export const createServer = (context: Context) => {
  const server = new McpServer({
    name: packageJson.name,
    version: packageJson.version,
  });

  const agentDescriptions = context.agents
    .map((agent) => `- ${agent.name}: ${agent.description}`)
    .join('\n');

  const superSubagents = SuperSubagents(context);

  server.registerTool(
    'agent-task',
    {
      description: `Execute a task using a configured AI agent.\n\nAvailable agents:\n${agentDescriptions}\n\nThe agent will execute the prompt and return the result. If sessionId is provided, it will continue from the previous session.`,
      inputSchema: superSubagents.agentTaskArgsSchema,
    },
    async (input) => {
      try {
        const result = await superSubagents.agentTask(input);
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
      inputSchema: superSubagents.agentTaskOutputSchema,
    },
    async (input) => {
      try {
        const result = await superSubagents.agentTaskOutput(input);
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

export const startServer = async (context: Context) => {
  const server = createServer(context);
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
