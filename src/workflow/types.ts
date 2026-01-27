import { type SdkType } from '../agent-sdk/types';

export type InputDef = {
  type: 'boolean' | 'string' | 'number' | 'integer' | 'object' | 'array';
  default?: unknown;
  required?: boolean;
};

export type RetryStrategy = 'fixed' | 'backoff';

export type OnError =
  | { type: 'fail' }
  | { type: 'skip' }
  | {
      type: 'retry';
      max: number;
      strategy?: RetryStrategy;
      seconds?: number;
      final?: 'fail' | 'skip';
    };

export type StepBase = {
  id: string;
  name?: string;
  needs?: string[];
  if?: string;
  timeoutSeconds?: number;
  onError?: OnError;
};

export type ShellExecute = {
  type: 'shell';
  run: string;
};

export type AgentExecute = {
  type: 'agent';
  sdkType: SdkType;
  model: string;
  prompt: string;
  structured?: unknown;
  agentType?: string;
};

export type SlackExecute = {
  type: 'slack';
  channel: string;
  message: {
    text: string;
  };
};

export type LoopExecute = {
  type: 'loop';
  max: number;
  until?: string;
  steps: StepDefinition[];
};

export type NonLoopExecute = ShellExecute | AgentExecute | SlackExecute;

export type ExecuteDef = NonLoopExecute | LoopExecute;

export type NonLoopStep = StepBase & {
  execute: NonLoopExecute;
};

export type LoopStep = StepBase & {
  execute: LoopExecute;
};

export type StepDefinition = NonLoopStep | LoopStep;

export type WorkflowDefinition = {
  id: string;
  name?: string;
  description?: string;
  inputs?: Record<string, InputDef>;
  steps: StepDefinition[];
};

export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export type StepOutputs = {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  output?: string;
  structured?: Record<string, unknown> | null;
};

export type StepResult = {
  status: StepStatus;
  outputs: StepOutputs;
  attempts: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
};

export type StepLog = {
  time: string;
  stepId: string;
  level: 'info' | 'error';
  message: string;
};

export type WorkflowRunResult = {
  status: 'success' | 'failed';
  steps: Record<string, StepResult>;
  logs: StepLog[];
  executions?: StepExecutionRecord[];
};

export type StepExecutionContext = {
  stepId: string;
  attempt: number;
  cwd: string;
  timeoutMs?: number;
};

export type ShellRunner = (
  input: StepExecutionContext & {
    run: string;
  },
) => Promise<{ stdout: string; stderr: string; exitCode: number; timedOut?: boolean }>;

export type AgentRunner = (
  input: StepExecutionContext & {
    sdkType: SdkType;
    model: string;
    prompt: string;
    agentType?: string;
  },
) => Promise<{ output: string; timedOut?: boolean }>;

export type SlackRunner = (
  input: StepExecutionContext & {
    channel: string;
    text: string;
  },
) => Promise<{ output: string; timedOut?: boolean }>;

export type StepRunners = {
  shell: ShellRunner;
  agent: AgentRunner;
  slack: SlackRunner;
};

export type WorkflowEngineOptions = {
  runners?: Partial<StepRunners>;
  clock?: {
    now: () => number;
    sleep: (ms: number) => Promise<void>;
  };
  cwd?: string;
  onLog?: (log: StepLog) => void;
  captureExecutions?: boolean;
};

export type StepExecutionRecord = {
  stepId: string;
  attempt: number;
  type: ExecuteDef['type'];
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  status: 'success' | 'failed';
  startedAt: string;
  finishedAt: string;
  error?: string;
};
