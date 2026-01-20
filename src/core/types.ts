import { type claudeModels } from './agent-sdks/claude/constants';
import { type codexModels } from './agent-sdks/codex/constants';
import { type copilotModels } from './agent-sdks/copilot/constants';
import { type geminiModels } from './agent-sdks/gemini-cli/constants';
import { type sdkTypes } from './constants';

export type SdkType = (typeof sdkTypes)[number];

export type AgentModel =
  | {
      sdkType: 'claude';
      model?: (typeof claudeModels)[number] | (string & {});
    }
  | {
      sdkType: 'codex';
      model?: (typeof codexModels)[number] | (string & {});
    }
  | {
      sdkType: 'copilot';
      model?: (typeof copilotModels)[number] | (string & {});
    }
  | {
      sdkType: 'gemini';
      model?: (typeof geminiModels)[number] | (string & {});
    };

type BaseTurn = {
  id: string;
};

export type QueuedTurn = BaseTurn & {
  status: 'queued';
  prompt: string;
  model?: string;
};

export type CompletedTurn = BaseTurn & {
  status: 'completed';
  prompt: string;
  output: string;
  model?: string;
};

export type FailedTurn = BaseTurn & {
  status: 'failed';
  prompt: string;
  model?: string;
  error: unknown;
};

/**
 * SDK の1つの応答を抽象化
 * Session:Turn = 1:N
 */
export type Turn = QueuedTurn | CompletedTurn | FailedTurn;

type BaseSession = {
  sdkType: SdkType;
  firstPrompt: string;
  cwd: string;
};

/**
 * SDK へ未送信のセッション
 */
export type PendingSession = BaseSession & {
  status: 'pending';
  currentTurn: QueuedTurn;
  turns: Turn[];
};

/**
 * ID が確定しているセッション
 */
export type RunningSession = BaseSession & {
  sdkSessionId: string;
  status: 'running';
  currentTurn: QueuedTurn;
  turns: Turn[];
};

/**
 * Agent の行動が完了し、待機中
 */
export type PausedSession = BaseSession & {
  sdkSessionId: string;
  status: 'paused';
  currentTurn: CompletedTurn | FailedTurn;
  turns: Turn[];
};

/**
 * Agent の行動が完了し、タスクが完了済み(再開不可)
 */
export type CompletedSession = BaseSession & {
  status: 'completed';
  sdkSessionId: string;
  firstPrompt: string;
  cwd: string;
  currentTurn: CompletedTurn;
  turns: Turn[];
};

/**
 * Agent の行動が失敗し、タスクが失敗した(再開不可)
 */
export type FailedSession = BaseSession & {
  status: 'failed';
  sdkSessionId?: string;
  currentTurn?: Turn;
  turns: Turn[];
  error: unknown;
};

/**
 * SDK の1つのセッション(複数応答)を抽象化する
 *
 * Flow:
 * - queued -> started -> running
 * - running -> paused or running -> failed
 * - paused -> running or paused -> completed
 */
export type Session =
  | PendingSession
  | RunningSession
  | PausedSession
  | CompletedSession
  | FailedSession;

export type StartSessionInput = AgentModel & {
  prompt: string;
  cwd: string;
};

export type ContinueSessionInput = {
  sdkSessionId: string;
  prompt: string;
};

export type ResumeSessionInput = StartSessionInput & {
  sdkSessionId: string;
};
