import type { StandardSchemaV1 } from '@standard-schema/spec';
import { input as inquirerInput } from '@inquirer/prompts';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { type InferStandardSchema } from '../lib/types';
import { agentStep } from './steps/agentStep';
import { bashStep } from './steps/bashStep';

type WorkflowContext<
  InputSchema extends StandardSchemaV1,
  S extends { raw: unknown; parsed: unknown } = InferStandardSchema<InputSchema>,
> = {
  executionId: string;
  input: S['parsed'];
  steps: {
    bash: typeof bashStep;
    agent: typeof agentStep;
  };
};

type WorkflowResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: unknown;
    };

const validateInput = async (
  schema: StandardSchemaV1,
  rawInput: unknown,
): Promise<
  | { success: true; value: unknown }
  | { success: false; issues: ReadonlyArray<StandardSchemaV1.Issue> }
> => {
  const result = await schema['~standard'].validate(rawInput);

  if (result.issues !== undefined) {
    return { success: false, issues: result.issues };
  }

  return { success: true, value: result.value };
};

export const defineWorkflow = <
  const InputSchema extends StandardSchemaV1,
  Ctx = WorkflowContext<InputSchema>,
>(
  name: string,
  inputSchema: InputSchema,
  cb: (ctx: Ctx) => WorkflowResult | Promise<WorkflowResult>,
) => {
  const buildContext = async (rawInput: unknown): Promise<Ctx> => {
    const validated = await validateInput(inputSchema, rawInput);

    if (!validated.success) {
      const messages = validated.issues.map((i) => i.message).join(', ');
      throw new Error(`Validation failed: ${messages}`);
    }

    // eslint-disable-next-line no-unsafe-type-assertion
    return {
      executionId: randomUUID(),
      input: validated.value,
      steps: {
        bash: bashStep,
        agent: agentStep,
      },
    } as unknown as Ctx;
  };

  const execute = async (rawInput: unknown) => {
    const ctx = await buildContext(rawInput);
    const result = await cb(ctx);
    return result;
  };

  return {
    name,
    inputSchema,
    execute,
  } as const;
};

type Workflow<T extends StandardSchemaV1> = {
  name: string;
  inputSchema: T;
  execute: (rawInput: unknown) => Promise<WorkflowResult>;
};

const parseCliArgs = (argv: readonly string[]): Record<string, string> => {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      args[match[1]] = match[2];
    }
  }
  return args;
};

const extractSchemaKeys = (schema: StandardSchemaV1): string[] => {
  // zod v4 の shape プロパティを duck-type で検出
  if (
    typeof schema === 'object' &&
    schema !== null &&
    'shape' in schema &&
    typeof schema.shape === 'object' &&
    schema.shape !== null
  ) {
    return Object.keys(schema.shape);
  }
  return [];
};

export const terminalRunner = async (workflow: Workflow<StandardSchemaV1>) => {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  const schemaKeys = extractSchemaKeys(workflow.inputSchema);

  const rawInput: Record<string, string> = { ...cliArgs };

  for (const key of schemaKeys) {
    rawInput[key] ??= await inquirerInput({
      message: `${key}:`,
    });
  }

  logger.info(`Running workflow "${workflow.name}" with input:`, rawInput);
  const result = await workflow.execute(rawInput);

  if (result.success) {
    logger.info(`Workflow "${workflow.name}" completed successfully`);
  } else {
    logger.error(`Workflow "${workflow.name}" failed:`, result.error);
  }

  return result;
};

export const sampleWorkflow = defineWorkflow(
  'sample',
  z.object({
    name: z.string(),
  }),
  async (ctx) => {
    const result = await ctx.steps.bash('echo', {
      cwd: process.cwd(),
      args: ['Hello,', ctx.input.name],
    });

    if (result.status === 'failed') {
      return {
        success: false,
        error: result.reason,
      };
    }

    logger.info(`bash output: ${result.stdout}`);

    return {
      success: true,
    };
  },
);

// Entry point: pnpm tsx src/experimental/workflow/example.ts --name=World
if (import.meta.url === `file://${process.argv[1]}`) {
  void terminalRunner(sampleWorkflow);
}
