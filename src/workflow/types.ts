import { type SdkType } from '../agent-sdk/types';

export type InputDef = {
  type: 'boolean' | 'string' | 'number' | 'integer' | 'object' | 'array';
  default?: unknown;
  required?: boolean;
};

export type RetryDef = {
  max?: number;
  strategy?: 'fixed' | 'backoff';
  seconds?: number;
};

export type OnError = 'fail' | 'skip' | 'retry';

export type StepBase = {
  id: string;
  name?: string;
  needs?: string[];
  if?: string;
  timeoutSeconds?: number;
  onError?: OnError;
  retry?: RetryDef;
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

export type ExecuteDef = ShellExecute | AgentExecute | SlackExecute;

export type RepeatDef = {
  max: number;
  until?: string;
};

export type ExecuteStep = StepBase & {
  execute: ExecuteDef;
  repeat?: undefined;
  steps?: undefined;
};

export type RepeatStep = StepBase & {
  repeat: RepeatDef;
  steps: StepDefinition[];
  execute?: undefined;
};

export type StepDefinition = ExecuteStep | RepeatStep;

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
};
