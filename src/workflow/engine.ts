import { createDefaultRunners } from './executors';
import { evaluateCondition } from './expression';
import { renderTemplate } from './template';
import {
  type ExecuteStep,
  type OnError,
  type StepDefinition,
  type StepOutputs,
  type StepResult,
  type StepStatus,
  type WorkflowDefinition,
  type WorkflowEngineOptions,
  type WorkflowRunResult,
  type StepLog,
  type StepRunners,
  type StepExecutionRecord,
} from './types';

const defaultClock = {
  now: () => globalThis.Date.now(),
  sleep: async (ms: number) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  },
};

type TimeoutResult<T> = { ok: true; value: T } | { ok: false; timedOut: true };

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs?: number,
): Promise<TimeoutResult<T>> => {
  if (timeoutMs === undefined) {
    return { ok: true, value: await promise };
  }
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ ok: false; timedOut: true }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ ok: false, timedOut: true }), timeoutMs);
  });
  const successPromise: Promise<TimeoutResult<T>> = promise.then((value) => ({
    ok: true,
    value,
  }));
  const result = await Promise.race<TimeoutResult<T>>([successPromise, timeoutPromise]);
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
  }
  return result;
};

const isTerminal = (status: StepStatus) =>
  status === 'success' || status === 'failed' || status === 'skipped';

const isoTime = (ms: number) => new globalThis.Date(ms).toISOString();

const summarizeOutput = (value: string, limit: number) => {
  const trimmed = value.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit)}...`;
};

const normalizeExpression = (
  raw: string,
): { ok: true; expression: string } | { ok: false; error: string } => {
  const trimmed = raw.trim();
  const hasStart = trimmed.startsWith('${{');
  const hasEnd = trimmed.endsWith('}}');
  if (hasStart && hasEnd) {
    const inner = trimmed.slice(3, -2).trim();
    if (inner.length === 0) {
      return { ok: false, error: 'Expression is empty' };
    }
    return { ok: true, expression: inner };
  }
  if (trimmed.includes('${{') || trimmed.includes('}}')) {
    return { ok: false, error: 'Expression must be a single ${{ ... }} block' };
  }
  return { ok: true, expression: trimmed };
};

const resolveInputs = (
  workflow: WorkflowDefinition,
  provided: Record<string, unknown>,
): { ok: true; inputs: Record<string, unknown> } | { ok: false; error: string } => {
  const result: Record<string, unknown> = {};
  const defs = workflow.inputs ?? {};
  for (const [key, def] of Object.entries(defs)) {
    if (provided[key] !== undefined) {
      result[key] = provided[key];
    } else if (def.default !== undefined) {
      result[key] = def.default;
    } else if (def.required === true) {
      return { ok: false, error: `Required input missing: ${key}` };
    }
  }
  for (const [key, value] of Object.entries(provided)) {
    if (result[key] === undefined) {
      result[key] = value;
    }
  }
  return { ok: true, inputs: result };
};

const indexSteps = (steps: StepDefinition[]) => {
  const map = new Map<string, StepDefinition>();
  const visit = (step: StepDefinition) => {
    if (map.has(step.id)) {
      throw new Error(`Duplicate step id: ${step.id}`);
    }
    map.set(step.id, step);
    if ('repeat' in step && step.steps) {
      step.steps.forEach(visit);
    }
  };
  steps.forEach(visit);
  return map;
};

const initializeResults = (steps: StepDefinition[]) => {
  const results: Record<string, StepResult> = {};
  const visit = (step: StepDefinition) => {
    results[step.id] = { status: 'pending', outputs: {}, attempts: 0 };
    if ('repeat' in step && step.steps) {
      step.steps.forEach(visit);
    }
  };
  steps.forEach(visit);
  return results;
};

const resetStep = (result: StepResult) => {
  result.status = 'pending';
  result.outputs = {};
  result.attempts = 0;
  result.startedAt = undefined;
  result.finishedAt = undefined;
  result.error = undefined;
};

const computeEffectiveNeeds = (
  stepId: string,
  stepMap: Map<string, StepDefinition>,
  results: Record<string, StepResult>,
  stack: Set<string>,
): string[] => {
  if (stack.has(stepId)) {
    throw new Error(`Circular dependency detected at ${stepId}`);
  }
  stack.add(stepId);
  const step = stepMap.get(stepId);
  const needs = step?.needs ?? [];
  const effective: string[] = [];
  for (const need of needs) {
    const needDef = stepMap.get(need);
    if (!needDef) {
      throw new Error(`Unknown dependency: ${need}`);
    }
    const result = results[need];
    if (!result) {
      throw new Error(`Missing dependency result: ${need}`);
    }
    const status = result.status;
    if (status !== 'skipped') {
      effective.push(need);
      continue;
    }
    const flattened = computeEffectiveNeeds(need, stepMap, results, stack);
    for (const item of flattened) {
      effective.push(item);
    }
  }
  stack.delete(stepId);
  return Array.from(new Set(effective));
};

const buildContext = (inputs: Record<string, unknown>, results: Record<string, StepResult>) => {
  const steps: Record<string, StepOutputs> = {};
  for (const [id, result] of Object.entries(results)) {
    steps[id] = result.outputs;
  }
  return { inputs, steps };
};

const renderIfExpression = (
  rawExpression: string,
  inputs: Record<string, unknown>,
  results: Record<string, StepResult>,
): { ok: true; value: boolean } | { ok: false; error: string } => {
  const normalized = normalizeExpression(rawExpression);
  if (!normalized.ok) {
    return normalized;
  }
  const evaluated = evaluateCondition({
    expression: normalized.expression,
    context: buildContext(inputs, results),
  });
  if (!evaluated.ok) {
    return { ok: false, error: evaluated.error.message };
  }
  return { ok: true, value: Boolean(evaluated.value) };
};

const renderStringTemplate = (
  template: string,
  inputs: Record<string, unknown>,
  results: Record<string, StepResult>,
): { ok: true; value: string } | { ok: false; error: string } => {
  const rendered = renderTemplate({
    template,
    context: buildContext(inputs, results),
  });
  if (!rendered.ok) {
    return { ok: false, error: rendered.error.message };
  }
  return { ok: true, value: rendered.value ?? '' };
};

const defaultRetry: { max: number; strategy: 'fixed' | 'backoff'; seconds: number } = {
  max: 0,
  strategy: 'fixed',
  seconds: 1,
};

const getOnError = (step: StepDefinition): OnError => step.onError ?? { type: 'fail' };

const getRetryDef = (
  step: StepDefinition,
): { max: number; strategy: 'fixed' | 'backoff'; seconds: number } => {
  const onError = getOnError(step);
  if (onError.type !== 'retry') {
    return { ...defaultRetry };
  }
  return {
    max: onError.max,
    strategy: onError.strategy ?? defaultRetry.strategy,
    seconds: onError.seconds ?? defaultRetry.seconds,
  };
};

const getFinalOnError = (step: StepDefinition): 'fail' | 'skip' => {
  const onError = getOnError(step);
  if (onError.type === 'retry') {
    return onError.final ?? 'fail';
  }
  return onError.type;
};

export const runWorkflow = async ({
  workflow,
  inputs,
  options,
}: {
  workflow: WorkflowDefinition;
  inputs: Record<string, unknown>;
  options?: WorkflowEngineOptions;
}): Promise<WorkflowRunResult> => {
  const clock = options?.clock ?? defaultClock;
  const defaultRunners = createDefaultRunners();
  const runners: StepRunners = {
    shell: options?.runners?.shell ?? defaultRunners.shell,
    agent: options?.runners?.agent ?? defaultRunners.agent,
    slack: options?.runners?.slack ?? defaultRunners.slack,
  };

  const resolved = resolveInputs(workflow, inputs);
  const logs: StepLog[] = [];
  const executions: StepExecutionRecord[] = [];

  if (!resolved.ok) {
    return {
      status: 'failed',
      steps: {},
      logs: [
        { time: isoTime(clock.now()), stepId: 'workflow', level: 'error', message: resolved.error },
      ],
      executions,
    };
  }

  const stepMap = indexSteps(workflow.steps);
  const results = initializeResults(workflow.steps);

  const log = (stepId: string, level: 'info' | 'error', message: string) => {
    const entry = { time: isoTime(clock.now()), stepId, level, message };
    logs.push(entry);
    options?.onLog?.(entry);
  };

  const startExecutionRecord = (record: StepExecutionRecord) => {
    executions.push(record);
    return record;
  };

  const finishExecutionRecord = (
    record: StepExecutionRecord | undefined,
    update: {
      output?: Record<string, unknown> | null;
      status: 'success' | 'failed';
      error?: string;
    },
  ) => {
    if (!record) {
      return;
    }
    record.output = update.output ?? null;
    record.status = update.status;
    record.finishedAt = isoTime(clock.now());
    if (update.error !== undefined) {
      record.error = update.error;
    }
  };

  const getResult = (stepId: string): StepResult => {
    const result = results[stepId];
    if (!result) {
      throw new Error(`Step result not found: ${stepId}`);
    }
    return result;
  };

  const setStatus = (stepId: string, status: StepStatus, error?: string) => {
    const result = getResult(stepId);
    result.status = status;
    if (status === 'running') {
      result.startedAt = isoTime(clock.now());
    }
    if (status === 'success' || status === 'failed' || status === 'skipped') {
      result.finishedAt = isoTime(clock.now());
    }
    if (error !== undefined) {
      result.error = error;
    }
  };

  const applyRetryDelay = async (attempt: number, retryDef: typeof defaultRetry) => {
    const baseSeconds = retryDef.seconds ?? defaultRetry.seconds;
    const delaySeconds =
      retryDef.strategy === 'backoff' ? baseSeconds * 2 ** (attempt - 1) : baseSeconds;
    if (delaySeconds > 0) {
      await clock.sleep(delaySeconds * 1000);
    }
  };

  const finalizeStepFailure = (step: StepDefinition, error: string): { status: StepStatus } => {
    const onError = getFinalOnError(step);
    if (onError === 'skip') {
      setStatus(step.id, 'skipped', error);
      log(step.id, 'info', `skipped: ${error}`);
      return { status: 'skipped' };
    }
    setStatus(step.id, 'failed', error);
    log(step.id, 'error', error);
    return { status: 'failed' };
  };

  const runExecuteStep = async (step: ExecuteStep): Promise<{ status: StepStatus }> => {
    const retryDef = getRetryDef(step);

    let attempt = 0;
    while (true) {
      attempt += 1;
      getResult(step.id).attempts = attempt;
      setStatus(step.id, 'running');
      log(step.id, 'info', `attempt ${attempt} start`);

      if (step.execute.type === 'shell') {
        const template = renderStringTemplate(step.execute.run, resolved.inputs, results);
        if (!template.ok) {
          if (attempt <= retryDef.max) {
            await applyRetryDelay(attempt, retryDef);
            continue;
          }
          return finalizeStepFailure(step, template.error);
        }
        const timeoutMs =
          step.timeoutSeconds !== undefined ? step.timeoutSeconds * 1000 : undefined;
        const record = startExecutionRecord({
          stepId: step.id,
          attempt,
          type: 'shell',
          input: {
            run: template.value,
            cwd: options?.cwd ?? process.cwd(),
            timeoutMs,
          },
          status: 'success',
          startedAt: isoTime(clock.now()),
          finishedAt: isoTime(clock.now()),
        });
        try {
          const { stdout, stderr, exitCode, timedOut } = await runners.shell({
            stepId: step.id,
            attempt,
            run: template.value,
            timeoutMs,
            cwd: options?.cwd ?? process.cwd(),
          });
          getResult(step.id).outputs = { stdout, stderr, exitCode };
          const output = { stdout, stderr, exitCode, timedOut };
          if (timedOut === true || exitCode !== 0) {
            const message = timedOut === true ? 'timeout' : `exitCode=${exitCode}`;
            finishExecutionRecord(record, { status: 'failed', output, error: message });
            if (attempt <= retryDef.max) {
              await applyRetryDelay(attempt, retryDef);
              continue;
            }
            return finalizeStepFailure(step, message);
          }
          finishExecutionRecord(record, { status: 'success', output });
          setStatus(step.id, 'success');
          if (stdout.length > 0) {
            log(step.id, 'info', `stdout: ${summarizeOutput(stdout, 200)}`);
          }
          log(step.id, 'info', 'success');
          return { status: 'success' };
        } catch (error) {
          const message = String(error);
          finishExecutionRecord(record, { status: 'failed', error: message });
          if (attempt <= retryDef.max) {
            await applyRetryDelay(attempt, retryDef);
            continue;
          }
          return finalizeStepFailure(step, message);
        }
      }

      if (step.execute.type === 'agent') {
        const template = renderStringTemplate(step.execute.prompt, resolved.inputs, results);
        if (!template.ok) {
          if (attempt <= retryDef.max) {
            await applyRetryDelay(attempt, retryDef);
            continue;
          }
          return finalizeStepFailure(step, template.error);
        }
        const timeoutMs =
          step.timeoutSeconds !== undefined ? step.timeoutSeconds * 1000 : undefined;
        const record = startExecutionRecord({
          stepId: step.id,
          attempt,
          type: 'agent',
          input: {
            sdkType: step.execute.sdkType,
            model: step.execute.model,
            prompt: template.value,
            agentType: step.execute.agentType ?? null,
            cwd: options?.cwd ?? process.cwd(),
            timeoutMs,
          },
          status: 'success',
          startedAt: isoTime(clock.now()),
          finishedAt: isoTime(clock.now()),
        });
        let execResult:
          | { ok: true; value: Awaited<ReturnType<StepRunners['agent']>> }
          | { ok: false; error: string; timedOut?: true };
        try {
          const result = await withTimeout(
            runners.agent({
              stepId: step.id,
              attempt,
              sdkType: step.execute.sdkType,
              model: step.execute.model,
              prompt: template.value,
              agentType: step.execute.agentType,
              timeoutMs,
              cwd: options?.cwd ?? process.cwd(),
            }),
            timeoutMs,
          );
          if (!result.ok) {
            execResult = { ok: false, error: 'timeout', timedOut: true };
          } else {
            execResult = { ok: true, value: result.value };
          }
        } catch (error) {
          execResult = { ok: false, error: String(error) };
        }
        if (!execResult.ok) {
          finishExecutionRecord(record, {
            status: 'failed',
            output: execResult.timedOut ? { timedOut: true } : null,
            error: execResult.error,
          });
          if (attempt <= retryDef.max) {
            await applyRetryDelay(attempt, retryDef);
            continue;
          }
          return finalizeStepFailure(step, execResult.error);
        }
        const { output, timedOut } = execResult.value;
        const outputs: StepOutputs = { output };
        if (step.execute.structured !== undefined) {
          try {
            const parsed: unknown = JSON.parse(output);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
              throw new Error('structured output must be an object');
            }
            const record: Record<string, unknown> = {};
            for (const [key, entry] of Object.entries(parsed)) {
              record[key] = entry;
            }
            outputs.structured = record;
          } catch (error) {
            if (attempt <= retryDef.max) {
              finishExecutionRecord(record, {
                status: 'failed',
                output: { output, timedOut },
                error: `structured parse failed: ${String(error)}`,
              });
              await applyRetryDelay(attempt, retryDef);
              continue;
            }
            finishExecutionRecord(record, {
              status: 'failed',
              output: { output, timedOut },
              error: `structured parse failed: ${String(error)}`,
            });
            return finalizeStepFailure(step, `structured parse failed: ${String(error)}`);
          }
        } else {
          outputs.structured = null;
        }
        getResult(step.id).outputs = outputs;
        if (timedOut === true) {
          finishExecutionRecord(record, {
            status: 'failed',
            output: { output, timedOut },
            error: 'timeout',
          });
          if (attempt <= retryDef.max) {
            await applyRetryDelay(attempt, retryDef);
            continue;
          }
          return finalizeStepFailure(step, 'timeout');
        }
        finishExecutionRecord(record, { status: 'success', output: { output, timedOut } });
        setStatus(step.id, 'success');
        if (output.length > 0) {
          log(step.id, 'info', `output: ${summarizeOutput(output, 200)}`);
        }
        log(step.id, 'info', 'success');
        return { status: 'success' };
      }

      if (step.execute.type === 'slack') {
        const template = renderStringTemplate(step.execute.message.text, resolved.inputs, results);
        if (!template.ok) {
          if (attempt <= retryDef.max) {
            await applyRetryDelay(attempt, retryDef);
            continue;
          }
          return finalizeStepFailure(step, template.error);
        }
        const timeoutMs =
          step.timeoutSeconds !== undefined ? step.timeoutSeconds * 1000 : undefined;
        const record = startExecutionRecord({
          stepId: step.id,
          attempt,
          type: 'slack',
          input: {
            channel: step.execute.channel,
            text: template.value,
            cwd: options?.cwd ?? process.cwd(),
            timeoutMs,
          },
          status: 'success',
          startedAt: isoTime(clock.now()),
          finishedAt: isoTime(clock.now()),
        });
        let execResult:
          | { ok: true; value: Awaited<ReturnType<StepRunners['slack']>> }
          | { ok: false; error: string; timedOut?: true };
        try {
          const result = await withTimeout(
            runners.slack({
              stepId: step.id,
              attempt,
              channel: step.execute.channel,
              text: template.value,
              timeoutMs,
              cwd: options?.cwd ?? process.cwd(),
            }),
            timeoutMs,
          );
          if (!result.ok) {
            execResult = { ok: false, error: 'timeout', timedOut: true };
          } else {
            execResult = { ok: true, value: result.value };
          }
        } catch (error) {
          execResult = { ok: false, error: String(error) };
        }
        if (!execResult.ok) {
          finishExecutionRecord(record, {
            status: 'failed',
            output: execResult.timedOut ? { timedOut: true } : null,
            error: execResult.error,
          });
          if (attempt <= retryDef.max) {
            await applyRetryDelay(attempt, retryDef);
            continue;
          }
          return finalizeStepFailure(step, execResult.error);
        }
        const { output, timedOut } = execResult.value;
        getResult(step.id).outputs = { output };
        if (timedOut === true) {
          finishExecutionRecord(record, {
            status: 'failed',
            output: { output, timedOut },
            error: 'timeout',
          });
          if (attempt <= retryDef.max) {
            await applyRetryDelay(attempt, retryDef);
            continue;
          }
          return finalizeStepFailure(step, 'timeout');
        }
        finishExecutionRecord(record, { status: 'success', output: { output, timedOut } });
        setStatus(step.id, 'success');
        if (output.length > 0) {
          log(step.id, 'info', `output: ${summarizeOutput(output, 200)}`);
        }
        log(step.id, 'info', 'success');
        return { status: 'success' };
      }

      return finalizeStepFailure(step, 'unsupported step type');
    }
  };

  const runStep = async (step: StepDefinition): Promise<{ status: StepStatus }> => {
    if (step.if !== undefined) {
      const condition = renderIfExpression(step.if, resolved.inputs, results);
      if (!condition.ok) {
        return finalizeStepFailure(step, condition.error);
      }
      if (condition.value === false) {
        setStatus(step.id, 'skipped');
        log(step.id, 'info', 'skipped by if');
        return { status: 'skipped' };
      }
    }

    if ('repeat' in step) {
      const repeat = step.repeat;
      const childSteps = step.steps;
      if (!repeat || !childSteps) {
        return finalizeStepFailure(step, 'repeat block is invalid');
      }
      setStatus(step.id, 'running');
      const repeatRecord = startExecutionRecord({
        stepId: step.id,
        attempt: 1,
        type: 'repeat',
        input: { max: repeat.max, until: repeat.until ?? null },
        status: 'success',
        startedAt: isoTime(clock.now()),
        finishedAt: isoTime(clock.now()),
      });
      let iterations = 0;
      for (let iteration = 1; iteration <= repeat.max; iteration += 1) {
        iterations = iteration;
        for (const child of childSteps) {
          resetStep(getResult(child.id));
        }
        const result = await executeStepList(childSteps);
        if (result.status === 'failed') {
          finishExecutionRecord(repeatRecord, {
            status: 'failed',
            output: { iterations },
            error: 'child step failed',
          });
          return { status: 'failed' };
        }
        if (repeat.until !== undefined) {
          const condition = renderIfExpression(repeat.until, resolved.inputs, results);
          if (!condition.ok) {
            finishExecutionRecord(repeatRecord, {
              status: 'failed',
              output: { iterations },
              error: condition.error,
            });
            return finalizeStepFailure(step, condition.error);
          }
          if (condition.value === true) {
            break;
          }
        }
      }
      finishExecutionRecord(repeatRecord, { status: 'success', output: { iterations } });
      setStatus(step.id, 'success');
      return { status: 'success' };
    }

    return runExecuteStep(step);
  };

  const executeStepList = async (steps: StepDefinition[]): Promise<{ status: StepStatus }> => {
    const pending = new Set(steps.map((step) => step.id));

    while (pending.size > 0) {
      let readyStep: StepDefinition | undefined;

      for (const step of steps) {
        if (!pending.has(step.id)) {
          continue;
        }
        if (getResult(step.id).status !== 'pending') {
          continue;
        }
        const needs = step.needs ?? [];
        let needsReady = true;
        for (const need of needs) {
          const status = getResult(need).status;
          if (!status || !isTerminal(status)) {
            needsReady = false;
            break;
          }
        }
        if (!needsReady) {
          continue;
        }

        let effectiveNeeds: string[] = [];
        try {
          effectiveNeeds = computeEffectiveNeeds(step.id, stepMap, results, new Set());
        } catch (error) {
          setStatus(step.id, 'failed', String(error));
          log(step.id, 'error', String(error));
          return { status: 'failed' };
        }
        if (effectiveNeeds.some((need) => getResult(need).status === 'failed')) {
          setStatus(step.id, 'failed', 'dependency failed');
          return { status: 'failed' };
        }
        if (!effectiveNeeds.every((need) => getResult(need).status === 'success')) {
          continue;
        }
        readyStep = step;
        break;
      }

      if (!readyStep) {
        log('workflow', 'error', 'deadlock: no ready steps');
        return { status: 'failed' };
      }

      const result = await runStep(readyStep);
      pending.delete(readyStep.id);

      if (result.status === 'failed' && getFinalOnError(readyStep) !== 'skip') {
        return { status: 'failed' };
      }
    }

    return { status: 'success' };
  };

  const outcome = await executeStepList(workflow.steps);
  return {
    status: outcome.status === 'failed' ? 'failed' : 'success',
    steps: results,
    logs,
    executions,
  };
};
