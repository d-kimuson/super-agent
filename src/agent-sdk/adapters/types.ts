import type * as claudeAgentSdk from '@anthropic-ai/claude-agent-sdk';
import type * as copilotSdk from '@github/copilot-sdk';
import type * as codexSdk from '@openai/codex-sdk';
import {
  type PendingSession,
  type RunningSession,
  type PausedSession,
  type FailedSession,
} from '../types';

export type AdapterOptions = {
  claudeCode?: Omit<
    claudeAgentSdk.Options,
    | 'abortController'
    | 'cwd'
    | 'model'
    | 'outputFormat'
    | 'permissionMode'
    | 'resume'
    | 'forkSession'
  >;
  codex?: {
    thread?: Omit<
      codexSdk.ThreadOptions,
      'model' | 'workingDirectory' | 'skipGitRepoCheck' | 'sandboxMode' | 'approvalPolicy'
    >;
    turn?: Omit<codexSdk.TurnOptions, 'outputSchema' | 'signal'>;
  };
  copilot?: Omit<copilotSdk.SessionConfig, 'sessionId' | 'model' | 'streaming'>;
};

export type AgentSDKAdapter = {
  startSession: (
    session: PendingSession,
    options?: {
      adapterOptions?: AdapterOptions;
    },
  ) => Promise<{
    code: 'success';
    session: RunningSession;
    stopped: Promise<PausedSession | FailedSession>;
  }>;
  continueSession: (session: RunningSession) => Promise<
    | {
        code: 'success';
        stopped: Promise<PausedSession | FailedSession>;
      }
    | {
        code: 'session-not-found';
      }
    | {
        code: 'session-illegal-state';
      }
  >;
  resumeSession: (
    session: RunningSession,
    options?: { adapterOptions?: AdapterOptions },
  ) => Promise<
    | {
        code: 'success';
        stopped: Promise<PausedSession | FailedSession>;
      }
    | {
        code: 'session-not-found';
      }
    | {
        code: 'session-illegal-state';
      }
  >;
  abortSession: (input: { sdkSessionId: string }) =>
    | {
        code: 'success';
      }
    | {
        code: 'session-not-found';
      }
    | {
        code: 'session-illegal-state';
      };
  cleanUp: () => Promise<void> | void;
};
