import { parse } from 'yaml';
import { providersSchema } from '../config/schema';
import {
  type ExecuteDef,
  type InputDef,
  type RetryDef,
  type StepBase,
  type StepDefinition,
  type WorkflowDefinition,
} from './types';

const assertObject = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  const record: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    record[key] = entry;
  }
  return record;
};

const assertString = (value: unknown, path: string) => {
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string`);
  }
  return value;
};

const assertArray = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  const items: unknown[] = [];
  for (const entry of value) {
    items.push(entry);
  }
  return items;
};

const parseRetry = (value: unknown, path: string): RetryDef | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const obj = assertObject(value, path);
  const maxValue = obj['max'];
  const strategyValue = obj['strategy'];
  const secondsValue = obj['seconds'];
  if (maxValue !== undefined && typeof maxValue !== 'number') {
    throw new Error(`${path}.max must be a number`);
  }
  if (strategyValue !== undefined && strategyValue !== 'fixed' && strategyValue !== 'backoff') {
    throw new Error(`${path}.strategy must be fixed or backoff`);
  }
  if (secondsValue !== undefined && typeof secondsValue !== 'number') {
    throw new Error(`${path}.seconds must be a number`);
  }
  const strategy =
    strategyValue === 'fixed' || strategyValue === 'backoff' ? strategyValue : undefined;
  return {
    max: maxValue,
    strategy,
    seconds: secondsValue,
  };
};

const validateExecute = (value: unknown, path: string): ExecuteDef => {
  const obj = assertObject(value, path);
  const type = assertString(obj['type'], `${path}.type`);
  if (type === 'shell') {
    return { type: 'shell', run: assertString(obj['run'], `${path}.run`) };
  }
  if (type === 'agent') {
    const sdkTypeValue = assertString(obj['sdkType'], `${path}.sdkType`);
    const sdkTypeParsed = providersSchema.safeParse(sdkTypeValue);
    if (!sdkTypeParsed.success) {
      throw new Error(`${path}.sdkType must be a valid provider`);
    }
    const agentTypeValue = obj['agentType'];
    if (agentTypeValue !== undefined && typeof agentTypeValue !== 'string') {
      throw new Error(`${path}.agentType must be a string`);
    }
    if (obj['structured'] !== undefined) {
      const structured = obj['structured'];
      if (typeof structured !== 'object' || structured === null || Array.isArray(structured)) {
        throw new Error(`${path}.structured must be an object`);
      }
    }
    return {
      type: 'agent',
      sdkType: sdkTypeParsed.data,
      model: assertString(obj['model'], `${path}.model`),
      prompt: assertString(obj['prompt'], `${path}.prompt`),
      structured: obj['structured'],
      agentType: agentTypeValue,
    };
  }
  if (type === 'slack') {
    const message = assertObject(obj['message'], `${path}.message`);
    return {
      type: 'slack',
      channel: assertString(obj['channel'], `${path}.channel`),
      message: {
        text: assertString(message['text'], `${path}.message.text`),
      },
    };
  }
  throw new Error(`${path}.type must be one of shell|agent|slack`);
};

const validateStep = (value: unknown, path: string): StepDefinition => {
  const obj = assertObject(value, path);
  const id = assertString(obj['id'], `${path}.id`);
  const name = obj['name'];
  if (name !== undefined && typeof name !== 'string') {
    throw new Error(`${path}.name must be a string`);
  }
  const needsRaw =
    obj['needs'] !== undefined ? assertArray(obj['needs'], `${path}.needs`) : undefined;
  const needs = needsRaw?.map((need, index) => assertString(need, `${path}.needs[${index}]`));
  const ifValue = obj['if'];
  if (ifValue !== undefined && typeof ifValue !== 'string') {
    throw new Error(`${path}.if must be a string`);
  }
  const timeoutSeconds = obj['timeoutSeconds'];
  if (timeoutSeconds !== undefined && typeof timeoutSeconds !== 'number') {
    throw new Error(`${path}.timeoutSeconds must be a number`);
  }
  const onErrorValue = obj['onError'];
  if (
    onErrorValue !== undefined &&
    onErrorValue !== 'fail' &&
    onErrorValue !== 'skip' &&
    onErrorValue !== 'retry'
  ) {
    throw new Error(`${path}.onError must be one of fail|skip|retry`);
  }
  const onError =
    onErrorValue === 'fail' || onErrorValue === 'skip' || onErrorValue === 'retry'
      ? onErrorValue
      : undefined;
  const stepBase: StepBase = {
    id,
    name: name ?? undefined,
    needs,
    if: ifValue ?? undefined,
    timeoutSeconds: timeoutSeconds ?? undefined,
    onError,
    retry: parseRetry(obj['retry'], `${path}.retry`),
  };

  const hasExecute = obj['execute'] !== undefined;
  const hasRepeat = obj['repeat'] !== undefined;

  if (hasExecute && hasRepeat) {
    throw new Error(`${path} cannot have both execute and repeat`);
  }
  if (!hasExecute && !hasRepeat) {
    throw new Error(`${path} must have either execute or repeat`);
  }

  if (hasExecute) {
    return {
      ...stepBase,
      execute: validateExecute(obj['execute'], `${path}.execute`),
    };
  }

  const repeatObj = assertObject(obj['repeat'], `${path}.repeat`);
  const max = repeatObj['max'];
  if (typeof max !== 'number') {
    throw new Error(`${path}.repeat.max must be a number`);
  }
  const steps = assertArray(obj['steps'], `${path}.steps`).map((child, index) =>
    validateStep(child, `${path}.steps[${index}]`),
  );
  return {
    ...stepBase,
    repeat: {
      max,
      until:
        repeatObj['until'] !== undefined
          ? assertString(repeatObj['until'], `${path}.repeat.until`)
          : undefined,
    },
    steps,
  };
};

export const loadWorkflowFromYaml = (yamlText: string): WorkflowDefinition => {
  const data: unknown = parse(yamlText);
  const obj = assertObject(data, 'workflow');
  const id = assertString(obj['id'], 'workflow.id');
  const steps = assertArray(obj['steps'], 'workflow.steps').map((step, index) =>
    validateStep(step, `workflow.steps[${index}]`),
  );
  const name = obj['name'];
  if (name !== undefined && typeof name !== 'string') {
    throw new Error('workflow.name must be a string');
  }
  const description = obj['description'];
  if (description !== undefined && typeof description !== 'string') {
    throw new Error('workflow.description must be a string');
  }
  let inputs: WorkflowDefinition['inputs'] | undefined;
  if (obj['inputs'] !== undefined) {
    const inputsObj = assertObject(obj['inputs'], 'workflow.inputs');
    const parsedInputs: Record<string, InputDef> = {};
    const parseInputType = (value: unknown, path: string) => {
      if (
        value === 'boolean' ||
        value === 'string' ||
        value === 'number' ||
        value === 'integer' ||
        value === 'object' ||
        value === 'array'
      ) {
        return value;
      }
      throw new Error(`${path}.type must be one of boolean|string|number|integer|object|array`);
    };
    for (const [key, value] of Object.entries(inputsObj)) {
      const inputObj = assertObject(value, `workflow.inputs.${key}`);
      const typeValue = parseInputType(
        assertString(inputObj['type'], `workflow.inputs.${key}.type`),
        `workflow.inputs.${key}`,
      );
      parsedInputs[key] = {
        type: typeValue,
        default: inputObj['default'],
        required:
          inputObj['required'] !== undefined
            ? (() => {
                if (typeof inputObj['required'] !== 'boolean') {
                  throw new Error(`workflow.inputs.${key}.required must be a boolean`);
                }
                return inputObj['required'];
              })()
            : undefined,
      };
    }
    inputs = parsedInputs;
  }

  const workflow: WorkflowDefinition = {
    id,
    name: name ?? undefined,
    description: description ?? undefined,
    inputs,
    steps,
  };

  return workflow;
};
