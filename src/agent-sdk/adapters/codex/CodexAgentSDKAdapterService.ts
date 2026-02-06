import { Codex, type ThreadOptions, type Thread } from '@openai/codex-sdk';
import {
  type ControllablePromise,
  createControllablePromise,
} from '../../../lib/controllablePromise';
import { logger } from '../../../lib/logger';
import {
  type RunningSession,
  type PausedSession,
  type CompletedTurn,
  type FailedTurn,
  type FailedSession,
  type PendingSession,
} from '../../types';
import { type AgentSDKAdapter } from '../types';

const threadOptions: ThreadOptions = {
  skipGitRepoCheck: true,
  sandboxMode: 'danger-full-access',
  approvalPolicy: 'never',
};

type PendingSessionProcess = {
  status: 'pending';
  thread: Thread;
  abortController: AbortController;
  startedPromise: ControllablePromise<RunningSession>;
  stoppedPromise: ControllablePromise<PausedSession | FailedSession>;
};

type RunningSessionProcess = Omit<PendingSessionProcess, 'status'> & {
  status: 'running';
  sdkSessionId: string;
};

type SessionProcess = PendingSessionProcess | RunningSessionProcess;

export const CodexAgentSDKAdapter = (): AgentSDKAdapter => {
  const codex = new Codex();
  const processMap = new Map<string, SessionProcess>();
  let isCleanedUp = false;

  const codexRun = (session: PendingSession | RunningSession) => {
    const abortController = new AbortController();

    const startedPromise = createControllablePromise<RunningSession>();
    const stoppedPromise = createControllablePromise<PausedSession | FailedSession>();

    const thread =
      session.status === 'running'
        ? codex.resumeThread(session.sdkSessionId, threadOptions)
        : codex.startThread({
            ...threadOptions,
            model: session.currentTurn.model,
            workingDirectory: session.cwd,
          });

    let currentProcess: SessionProcess = {
      status: 'pending',
      thread,
      abortController,
      startedPromise,
      stoppedPromise,
    };

    const daemon = async () => {
      try {
        const result = await thread.runStreamed(session.currentTurn.prompt, {
          signal: abortController.signal,
          outputSchema:
            session.currentTurn.outputSchema === undefined
              ? undefined
              : {
                  ...session.currentTurn.outputSchema,
                  additionalProperties: false,
                },
        });

        let threadId: string | undefined = undefined;
        let lastMessage: string | undefined = undefined;

        for await (const event of result.events) {
          if (abortController.signal.aborted) {
            break;
          }

          // sync currentProcess
          if (currentProcess.status === 'running') {
            currentProcess = {
              ...(processMap.get(currentProcess.sdkSessionId) ?? currentProcess),
            };
          }

          switch (event.type) {
            case 'thread.started':
              threadId = event.thread_id;

              if (currentProcess.status === 'pending') {
                currentProcess = {
                  ...currentProcess,
                  status: 'running',
                  sdkSessionId: threadId,
                };

                processMap.set(threadId, currentProcess);
              }

              if (currentProcess.startedPromise.value.status === 'pending') {
                currentProcess.startedPromise.resolve({
                  ...session,
                  status: 'running',
                  sdkSessionId: threadId,
                });
              }
              continue;

            case 'item.completed': {
              if (event.item.type === 'agent_message') {
                lastMessage = event.item.text;
              }
              continue;
            }

            case 'turn.completed': {
              if (currentProcess.status === 'pending') {
                throw new Error('process not initialized');
              }

              if (lastMessage === undefined) {
                throw new Error('lastMessage must be defined');
              }

              const structuredOutput: unknown =
                session.currentTurn.outputSchema === undefined
                  ? undefined
                  : JSON.parse(lastMessage);

              const nextTurn: CompletedTurn = {
                ...session.currentTurn,
                status: 'completed',
                output: lastMessage,
                structuredOutput,
              };

              const nextSession: PausedSession = {
                ...session,
                status: 'paused',
                sdkSessionId: currentProcess.sdkSessionId,
                currentTurn: nextTurn,
                turns: [
                  ...session.turns.filter((task) => task.id !== session.currentTurn.id),
                  nextTurn,
                ],
              };

              currentProcess.stoppedPromise.resolve(nextSession);
              continue;
            }

            case 'turn.failed': {
              if (currentProcess.status === 'running') {
                const nextTurn: FailedTurn = {
                  ...session.currentTurn,
                  status: 'failed',
                  error: 'Turn failed',
                };

                const nextSession: FailedSession | PausedSession =
                  currentProcess.sdkSessionId === undefined
                    ? {
                        ...session,
                        status: 'failed',
                        sdkSessionId: currentProcess.sdkSessionId,
                        currentTurn: nextTurn,
                        turns: [
                          ...session.turns.filter((task) => task.id !== session.currentTurn.id),
                          nextTurn,
                        ],
                        error: 'Turn failed',
                      }
                    : {
                        ...session,
                        status: 'paused',
                        sdkSessionId: currentProcess.sdkSessionId,
                        currentTurn: nextTurn,
                        turns: [
                          ...session.turns.filter((task) => task.id !== session.currentTurn.id),
                          nextTurn,
                        ],
                      };

                currentProcess.stoppedPromise.resolve(nextSession);
              }
              continue;
            }

            case 'error': {
              if (currentProcess.status === 'running') {
                const nextTurn: FailedTurn = {
                  ...session.currentTurn,
                  status: 'failed',
                  error: event,
                };

                const nextSession: PausedSession = {
                  ...session,
                  status: 'paused',
                  sdkSessionId: currentProcess.sdkSessionId,
                  currentTurn: nextTurn,
                  turns: [
                    ...session.turns.filter((task) => task.id !== session.currentTurn.id),
                    nextTurn,
                  ],
                };

                currentProcess.stoppedPromise.resolve(nextSession);
              }
              continue;
            }

            case 'item.started':
            case 'item.updated':
            case 'turn.started':
              // do nothing
              continue;

            default:
              continue;
          }
        }
      } catch (error) {
        logger.error('Codex error', error);
        currentProcess.stoppedPromise.reject(error);
      }
    };

    void daemon();

    return {
      startedPromise: startedPromise.promise,
      stoppedPromise: stoppedPromise.promise,
    };
  };

  return {
    startSession: async (pendingSession) => {
      const { startedPromise, stoppedPromise } = codexRun(pendingSession);

      const runningSession = await startedPromise;

      return {
        code: 'success',
        session: runningSession,
        stopped: stoppedPromise,
      };
    },

    // eslint-disable-next-line require-await
    continueSession: async (continueSession) => {
      const currentProcess = processMap.get(continueSession.sdkSessionId);

      if (!currentProcess) {
        logger.error(`SessionNotFoundError(${continueSession.sdkSessionId})`);
        return {
          code: 'session-not-found',
        };
      }

      const startedPromise = createControllablePromise<RunningSession>();
      const stoppedPromise = createControllablePromise<PausedSession | FailedSession>();

      processMap.set(continueSession.sdkSessionId, {
        ...currentProcess,
        startedPromise,
        stoppedPromise,
      });

      // Codex SDK doesn't support direct continue - we need to run again with the existing thread
      const { stoppedPromise: newStoppedPromise } = codexRun(continueSession);
      startedPromise.resolve(continueSession);

      return {
        code: 'success',
        stopped: newStoppedPromise,
      };
    },

    // eslint-disable-next-line require-await
    resumeSession: async (resumeSession) => {
      // Validate that sdkSessionId exists
      if (resumeSession.sdkSessionId === undefined) {
        return {
          code: 'session-illegal-state',
        };
      }

      const { stoppedPromise } = codexRun(resumeSession);

      return {
        code: 'success',
        stopped: stoppedPromise,
      };
    },

    abortSession: (input) => {
      const process = processMap.get(input.sdkSessionId);

      if (!process) {
        logger.error(`SessionNotFoundError(${input.sdkSessionId})`);
        return {
          code: 'session-not-found',
        };
      }

      process.abortController.abort();
      processMap.delete(input.sdkSessionId);

      logger.info(`Session aborted: ${input.sdkSessionId}`);
      return {
        code: 'success',
      };
    },

    cleanUp: async () => {
      // 冪等性の保証: 複数回呼び出されても安全に動作
      if (isCleanedUp) {
        logger.info('CodexAgentSDKAdapter is already cleaned up');
        return;
      }
      isCleanedUp = true;

      logger.info('Cleaning up CodexAgentSDKAdapter...');

      // 全セッションの中断
      await Promise.allSettled(
        Array.from(processMap.entries()).map(([sessionId, process]) => {
          process.abortController.abort();
          logger.info(`Session aborted during cleanup: ${sessionId}`);
        }),
      );

      processMap.clear();
      logger.info('CodexAgentSDKAdapter cleaned up');
    },
  };
};
