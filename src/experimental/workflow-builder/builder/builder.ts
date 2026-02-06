import type { StandardSchemaV1 } from '@standard-schema/spec';
import { type flags } from '../flags';
import { workflowRun } from '../runtime/workflowRun';
import { type InferStandartSchema, type StepDef, type Builder, type WorkflowDef } from './types';

export const workflowBuilder = <
  const Input extends StandardSchemaV1,
  const State extends Record<string, unknown>,
  const InputSchema extends { raw: unknown; parsed: unknown } = InferStandartSchema<Input>,
>(
  name: string,
  description: string,
  inputSchema: Input,
  initialState: () => State,
) => {
  type Context = {
    rawInput: InputSchema['raw'];
    input: InputSchema['parsed'];
    steps: Record<string, unknown>;
    flags: typeof flags;
    state: State;
  };

  const steps: { name: string; def: StepDef<Context> }[] = [];
  const step = (name: string, def: StepDef<Context>) => {
    steps.push({ name, def });
    return builder;
  };
  const builder: Builder<Context> = {
    // eslint-disable-next-line no-unsafe-type-assertion
    step: step as Builder<Context>['step'],
    build: () => {
      const def: WorkflowDef<Context> = {
        name,
        description,
        inputSchema,
        steps,
        initialState,
      };

      return {
        ...def,
        run: workflowRun(def),
      };
    },
  };

  return builder;
};
