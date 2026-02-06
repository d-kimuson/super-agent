import type {
  StandardSchemaV1,
  StandardTypedV1,
  StandardJSONSchemaV1,
} from '@standard-schema/spec';
import type { SdkType } from '../../../agent-sdk/types';
import { type Flags } from '../flags';
import { type ICtx } from '../types';

type OrPromise<T> = T | Promise<T>;

export type InferStandartSchema<T extends StandardSchemaV1> =
  NonNullable<T['~standard']['types']> extends StandardTypedV1.Types<infer I1, infer I2>
    ? { raw: I1; parsed: I2 }
    : { raw: never; parsed: never };

type BaseStepDef<Ctx extends ICtx> = {
  description?: string;
  timeoutSeconds?: number;
  mutateStateAfterStep?: (ctx: Ctx) => Ctx;
  onError?:
    | {
        type: 'exit';
      }
    | {
        type: 'skip';
      }
    | {
        type: 'retry';
        attempts: number;
        strategy: 'fixed' | 'backoff';
        seconds: number;
      };
};

export type ShellStepDef<Ctx extends ICtx> = BaseStepDef<Ctx> & {
  type: 'shell';
  command: (ctx: Ctx) => OrPromise<string[] | Flags['skip']>;
};

export type AgentStepDef<Ctx extends ICtx> = BaseStepDef<Ctx> & {
  type: 'agent';
  sdkType: SdkType;
  model?: string;
  prompt: (ctx: Ctx) => OrPromise<string | Flags['skip']>;
  structured?: StandardJSONSchemaV1;
};

export type LoopStepDef<Ctx extends ICtx> = BaseStepDef<Ctx> & {
  type: 'loop';
  condition: (ctx: Ctx) => OrPromise<Flags['continue'] | Flags['break']>;
  steps: StepDef<Ctx>[];
};

export type StepDef<Ctx extends ICtx = ICtx> = BaseStepDef<Ctx> &
  (ShellStepDef<Ctx> | AgentStepDef<Ctx> | LoopStepDef<Ctx>);

export type ExtractStepOutput<Ctx extends ICtx, T extends StepDef<Ctx>> = T extends {
  type: 'shell';
}
  ? {
      stdout: string;
      stderr: string;
    }
  : T extends { type: 'agent' }
    ? {
        message: string;
        structured: T['structured'] extends StandardSchemaV1
          ? InferStandartSchema<T['structured']>['parsed']
          : undefined;
      }
    : T extends { type: 'agent-type' }
      ? {
          message: string;
          structured: T['structured'] extends StandardSchemaV1
            ? InferStandartSchema<T['structured']>['parsed']
            : undefined;
        }
      : never;

export type StepResult =
  | {
      status: 'skipped';
    }
  | {
      status: 'success';
      output: unknown;
    }
  | {
      status: 'failed';
      error: unknown;
    };

type AddStepToCtx<Ctx extends ICtx, Name extends string, Result extends StepResult> = Omit<
  Ctx,
  'steps'
> & {
  steps: Ctx['steps'] & {
    [K in Name]: Result;
  };
};

export type WorkflowDef<Ctx extends ICtx> = {
  name: string;
  description: string;
  inputSchema: StandardSchemaV1;
  initialState: () => Ctx['state'];
  steps: readonly { name: string; def: StepDef<Ctx> }[];
};

export type WorkflowRun<Ctx extends ICtx> = (rawInput: Ctx['rawInput']) => Promise<
  | {
      success: true;
      steps: { name: string; result: StepResult }[];
    }
  | {
      success: false;
      code: 'validation-error';
    }
  | {
      success: false;
      code: 'step-error';
      error: unknown;
    }
>;

export type Workflow<Ctx extends ICtx = ICtx> = WorkflowDef<Ctx> & {
  run: WorkflowRun<Ctx>;
};

export type Builder<Ctx extends ICtx = ICtx> = {
  step: <Name extends string, D extends StepDef<Ctx>, StepOutput = ExtractStepOutput<Ctx, D>>(
    name: Name,
    def: D,
  ) => Builder<
    AddStepToCtx<
      Ctx,
      Name,
      | {
          status: 'skipped';
        }
      | {
          status: 'success';
          output: StepOutput;
        }
    >
  >;
  build: () => Workflow<Ctx>;
};
