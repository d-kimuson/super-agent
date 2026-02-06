import { Command, type Command as CommandType } from 'commander';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ZodError } from 'zod';
import { env } from '../../config/env';
import { loadContext } from '../../config/loadContext';
import { cliArgsSchema, providersSchema } from '../../config/schema';
import { AgentToolsService } from '../../core/AgentToolsService';
import { runWorkflow } from '../../experimental/workflow-yaml/engine';
import { mergeInputs } from '../../experimental/workflow-yaml/inputs';
import { loadWorkflowFromYaml } from '../../experimental/workflow-yaml/loader';
import { resolveWorkflowPath } from '../../experimental/workflow-yaml/resolveWorkflowPath';
import { logger } from '../../lib/logger';

type GlobalOptions = {
  ssaDir?: string;
  availableProviders?: string;
  disabledModels?: string;
  agentsDir?: string;
  skillsDir?: string;
};

type InputsJsonResult = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

const parseInputsJson = (raw: string): InputsJsonResult => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: 'inputs-json must be an object' };
    }
    const record: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(parsed)) {
      record[key] = entry;
    }
    return { ok: true, value: record };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
};

const parseInputPairs = (pairs: string[]) => {
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex <= 0) {
      return { ok: false, error: `Invalid input format: ${pair}` };
    }
    const key = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1);
    if (key.length === 0) {
      return { ok: false, error: `Invalid input key: ${pair}` };
    }
    result[key] = value;
  }
  return { ok: true, value: result };
};

const parseDisabledSdkTypes = (raw?: string) => {
  if (raw === undefined || raw.length === 0) {
    return { ok: true, value: undefined };
  }
  const types = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const valid: Array<'claude' | 'codex' | 'copilot' | 'gemini'> = [];
  for (const entry of types) {
    const parsed = providersSchema.safeParse(entry);
    if (!parsed.success) {
      logger.warn(`Invalid SDK type ignored: ${entry}`);
      continue;
    }
    valid.push(parsed.data);
  }
  return { ok: true, value: valid.length > 0 ? valid : undefined };
};

export const createToolsCommand = () => {
  const toolsCommand = new Command('tools');
  toolsCommand.description('Execute MCP server tools directly from CLI');

  toolsCommand
    .command('agent-task')
    .description('Execute a task using a configured AI agent')
    .requiredOption('-p, --prompt <prompt>', 'The instruction/prompt for the agent')
    .option('--agent-type <type>', 'The agent to use for this task')
    .option(
      '-r, --resume <sessionId>',
      'Optional session ID to continue from a previous conversation',
    )
    .option(
      '--disabled-sdk-types <types>',
      'Comma-separated list of SDK types to exclude (e.g., claude,codex)',
    )
    .option('-o, --output-format <format>', 'Output format: message (default) or json', 'message')
    .action(async function (
      this: CommandType,
      options: {
        agentType?: string;
        prompt: string;
        resume?: string;
        disabledSdkTypes?: string;
        outputFormat: string;
      },
    ) {
      try {
        // 親コマンドからグローバルオプションを取得
        const rootCommand = this.parent?.parent;
        const opts = rootCommand?.opts<GlobalOptions>();

        // CLI args を構築
        const cliArgs = cliArgsSchema.parse({
          'sa-dir': opts?.ssaDir,
          'available-providers': opts?.availableProviders,
          'disabled-models': opts?.disabledModels,
          'agents-dir': opts?.agentsDir,
          'skills-dir': opts?.skillsDir,
        });

        // context を読み込み
        const context = await loadContext({
          cliArgs,
          envVars: {
            SA_DIR: env.getEnv('SA_DIR'),
            SA_AVAILABLE_PROVIDERS: env.getEnv('SA_AVAILABLE_PROVIDERS'),
            SA_DISABLED_MODELS: env.getEnv('SA_DISABLED_MODELS'),
            SA_AGENT_DIRS: env.getEnv('SA_AGENT_DIRS'),
            SA_SKILL_DIRS: env.getEnv('SA_SKILL_DIRS'),
          },
        });

        const superSubagents = AgentToolsService(context);

        // Parse disabledSdkTypes from comma-separated string
        const disabledSdkTypes =
          options.disabledSdkTypes !== undefined && options.disabledSdkTypes.length > 0
            ? options.disabledSdkTypes
                .split(',')
                .map((s) => s.trim())
                .filter((s): s is 'claude' | 'codex' | 'copilot' | 'gemini' => {
                  const parsed = providersSchema.safeParse(s);
                  if (!parsed.success) {
                    logger.warn(`Invalid SDK type ignored: ${s}`);
                    return false;
                  }
                  return true;
                })
            : undefined;

        // agent-task を実行
        const result = await superSubagents.agentTask({
          agentType: options.agentType,
          cwd: process.cwd(),
          prompt: options.prompt,
          resume: options.resume,
          runInBackground: false,
          disabledSdkTypes,
        });

        // 結果を出力
        if (result.success) {
          if (options.outputFormat === 'json') {
            logger.info(JSON.stringify(result, null, 2));
          } else {
            logger.info(result.message);
          }
          process.exit(0);
        } else {
          if (options.outputFormat === 'json') {
            logger.error(JSON.stringify(result, null, 2));
          } else {
            logger.error(result.message);
          }
          process.exit(1);
        }
      } catch (error) {
        logger.error('Failed to execute agent-task:', error);
        process.exit(1);
      }
    });

  const collectInput = (value: string, previous: string[] | undefined) => {
    if (previous === undefined) {
      return [value];
    }
    return [...previous, value];
  };

  toolsCommand
    .command('workflow-validate')
    .description('Validate all workflow YAML files in a directory')
    .option(
      '--workflow-dir <path>',
      'Workflow directory (default: ./example-config/workflows)',
      './example-config/workflows',
    )
    .action(async (options: { workflowDir: string }) => {
      try {
        const dir = resolve(options.workflowDir);
        const entries = await readdir(dir);
        const yamlFiles = entries.filter((f) => f.endsWith('.yaml') ?? f.endsWith('.yml'));

        if (yamlFiles.length === 0) {
          logger.warn(`No workflow files found in ${dir}`);
          process.exit(0);
        }

        let hasError = false;
        for (const file of yamlFiles) {
          const filePath = resolve(dir, file);
          const yamlText = await readFile(filePath, 'utf-8');
          try {
            loadWorkflowFromYaml(yamlText);
            logger.info(`✓ ${file}`);
          } catch (error) {
            hasError = true;
            if (error instanceof ZodError) {
              logger.error(`✗ ${file}`);
              for (const issue of error.issues) {
                logger.error(`  ${issue.path.join('.')}: ${issue.message}`);
              }
            } else {
              logger.error(`✗ ${file}: ${String(error)}`);
            }
          }
        }

        process.exit(hasError ? 1 : 0);
      } catch (error) {
        logger.error('Failed to validate workflows:', error);
        process.exit(2);
      }
    });

  toolsCommand
    .command('workflow-run')
    .description('Run a workflow YAML definition')
    .argument('<name>', 'Workflow name or path')
    .option(
      '--workflow-dir <path>',
      'Workflow directory (default: ./example-config/workflows)',
      './example-config/workflows',
    )
    .option('--input <pair>', 'Input value (format: key=value)', collectInput)
    .option('--inputs-json <json>', 'Inputs as JSON object')
    .option('--disabled-sdk-types <types>', 'Comma-separated list of SDK types to exclude')
    .option('--strict-inputs', 'Fail on unknown input keys', false)
    .option('-o, --output-format <format>', 'Output format: message (default) or json', 'message')
    .option('--cwd <path>', 'Working directory for workflow execution', process.cwd())
    .option('--debug', 'Write workflow debug log to .super-agent/workflow/debug', false)
    .action(async function (
      this: CommandType,
      name: string,
      options: {
        workflowDir: string;
        input?: string[];
        inputsJson?: string;
        disabledSdkTypes?: string;
        strictInputs: boolean;
        outputFormat: string;
        cwd: string;
        debug: boolean;
      },
    ) {
      try {
        if (options.outputFormat === 'json') {
          logger.setLoggerType('stderr');
        }
        const executionId = randomUUID();
        const executionStartedAt = new Date().toISOString();
        logger.info(`execution: ${executionId}`);
        const rootCommand = this.parent?.parent;
        const opts = rootCommand?.opts<GlobalOptions>();

        const cliArgs = cliArgsSchema.parse({
          'sa-dir': opts?.ssaDir,
          'available-providers': opts?.availableProviders,
          'disabled-models': opts?.disabledModels,
          'agents-dir': opts?.agentsDir,
          'skills-dir': opts?.skillsDir,
        });

        const context = await loadContext({
          cliArgs,
          envVars: {
            SA_DIR: env.getEnv('SA_DIR'),
            SA_AVAILABLE_PROVIDERS: env.getEnv('SA_AVAILABLE_PROVIDERS'),
            SA_DISABLED_MODELS: env.getEnv('SA_DISABLED_MODELS'),
            SA_AGENT_DIRS: env.getEnv('SA_AGENT_DIRS'),
            SA_SKILL_DIRS: env.getEnv('SA_SKILL_DIRS'),
          },
        });

        const workflowPath = resolveWorkflowPath({
          name,
          workflowDir: resolve(options.workflowDir),
          cwd: options.cwd,
        });
        const yamlText = await readFile(workflowPath, 'utf-8');
        const workflow = loadWorkflowFromYaml(yamlText);

        const pairInputs = parseInputPairs(options.input ?? []);
        if (!pairInputs.ok) {
          throw new Error(pairInputs.error);
        }
        let jsonInputs: Record<string, unknown> = {};
        if (options.inputsJson !== undefined) {
          const parsed = parseInputsJson(options.inputsJson);
          if (!parsed.ok) {
            throw new Error(parsed.error);
          }
          jsonInputs = parsed.value;
        }
        const combinedInputs = { ...jsonInputs, ...pairInputs.value };
        const merged = mergeInputs({
          defs: workflow.inputs,
          inputs: combinedInputs,
          strict: options.strictInputs,
        });
        if (!merged.ok) {
          throw new Error(merged.error);
        }

        const disabledSdkTypes = parseDisabledSdkTypes(options.disabledSdkTypes).value;
        const toolsService = AgentToolsService(context);

        const result = await runWorkflow({
          workflow,
          inputs: merged.value,
          options: {
            cwd: options.cwd,
            captureExecutions: options.debug,
            onLog: (entry) => {
              if (entry.level === 'error') {
                logger.error(`[${entry.stepId}] ${entry.message}`);
              } else {
                logger.info(`[${entry.stepId}] ${entry.message}`);
              }
            },
            runners: {
              agent: async ({ prompt, cwd, agentType }) => {
                const resolvedAgentType = agentType ?? 'general';
                const response = await toolsService.agentTask({
                  agentType: resolvedAgentType,
                  prompt,
                  cwd,
                  runInBackground: false,
                  disabledSdkTypes,
                });
                if (!response.success) {
                  throw new Error(response.message);
                }
                return { output: response.message };
              },
            },
          },
        });

        const success = result.status === 'success';
        if (options.debug) {
          const debugDir = resolve(process.cwd(), '.super-agent', 'debug', 'workflow');
          await mkdir(debugDir, { recursive: true });
          const debugPayload = {
            executionId,
            workflow: {
              id: workflow.id,
              path: workflowPath,
            },
            status: result.status,
            startedAt: executionStartedAt,
            finishedAt: new Date().toISOString(),
            inputs: merged.value,
            executedSteps: result.executions ?? [],
          };
          const debugPath = resolve(debugDir, `${executionId}.json`);
          await writeFile(debugPath, JSON.stringify(debugPayload, null, 2), 'utf-8');
        }
        if (options.outputFormat === 'json') {
          const payload = {
            success,
            workflow: {
              id: workflow.id,
              path: workflowPath,
            },
            result,
          };
          process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
        } else {
          logger.info(`workflow: ${workflow.id}`);
          logger.info(`status: ${result.status}`);
          if (!success) {
            logger.error('workflow failed');
          }
        }

        process.exit(success ? 0 : 1);
      } catch (error) {
        logger.error('Failed to execute workflow-run:', error);
        process.exit(2);
      }
    });

  return toolsCommand;
};
