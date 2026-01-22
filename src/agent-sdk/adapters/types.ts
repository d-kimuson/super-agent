import {
  type PendingSession,
  type RunningSession,
  type PausedSession,
  type FailedSession,
} from '../types';

export type AgentSDKAdapter = {
  startSession: (session: PendingSession) => Promise<{
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
  resumeSession: (session: RunningSession) => Promise<
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
