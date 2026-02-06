import * as claudeAgentSdk from '@anthropic-ai/claude-agent-sdk';
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
import { createMessageGenerator, type MessageGenerator } from './createMessageGenerator';

type PendingSessionProcess = {
  status: 'pending';
  abortController: AbortController;
  messageGenerator: MessageGenerator;
  startedPromise: ControllablePromise<RunningSession>;
  stoppedPromise: ControllablePromise<PausedSession | FailedSession>;
};

type RunningSessionProcess = Omit<PendingSessionProcess, 'status'> & {
  status: 'running';
  sdkSessionId: string;
};

type SessionProcess = PendingSessionProcess | RunningSessionProcess;

export const ClaudeAgentSDKAdapter = (): AgentSDKAdapter => {
  const processMap = new Map<string, SessionProcess>();
  let isCleanedUp = false;

  const claudeCodeRun = (session: PendingSession | RunningSession) => {
    const abortController = new AbortController();
    const messageGenerator = createMessageGenerator();

    const startedPromise = createControllablePromise<RunningSession>();
    const stoppedPromise = createControllablePromise<PausedSession | FailedSession>();

    let currentProcess: SessionProcess = {
      status: 'pending',
      abortController,
      messageGenerator,
      startedPromise,
      stoppedPromise,
    };

    const messageIter = claudeAgentSdk.query({
      prompt: messageGenerator.generateMessages(),
      options: {
        abortController,
        cwd: session.cwd,
        model: session.currentTurn.model ?? 'default',
        disallowedTools: [
          'AskUserQuestion', // TUI でないと返答不可
        ],
        outputFormat:
          session.currentTurn.outputSchema === undefined
            ? undefined
            : {
                type: 'json_schema',
                schema: session.currentTurn.outputSchema,
              },
        permissionMode: 'bypassPermissions', // TODO: 承認機能も欲しい感
        ...(session.status === 'running'
          ? { resume: session.sdkSessionId, forkSession: true }
          : {}),
      },
    });

    if (session.status === 'running') {
      // continue 時は sdkSessionId が確定済みなので即時 resolve
      startedPromise.resolve(session);
    }

    const daemon = async () => {
      try {
        for await (const message of messageIter) {
          // sync currentProcess
          if (currentProcess.status === 'running') {
            currentProcess = {
              ...(processMap.get(message.session_id) ?? currentProcess),
            };
          }

          if (message.type === 'system' && message.subtype === 'init') {
            if (currentProcess.status === 'pending') {
              currentProcess = {
                ...currentProcess,
                status: 'running',
                sdkSessionId: message.session_id,
              };

              processMap.set(message.session_id, currentProcess);
            }

            if (currentProcess.startedPromise.value.status === 'pending') {
              currentProcess.startedPromise.resolve({
                ...session,
                status: 'running',
                sdkSessionId: message.session_id,
              });
            }

            continue;
          }

          if (message.type === 'result') {
            if (message.subtype === 'success') {
              if (currentProcess.status === 'pending') {
                throw new Error('process not initialized');
              }

              const nextTurn: CompletedTurn = {
                ...session.currentTurn,
                status: 'completed',
                output: message.result,
                structuredOutput: message.structured_output,
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

            if (
              message.subtype === 'error_during_execution' ||
              message.subtype === 'error_max_turns' ||
              message.subtype === 'error_max_budget_usd' ||
              message.subtype === 'error_max_structured_output_retries'
            ) {
              if (currentProcess.status === 'running') {
                const nextTurn: FailedTurn = {
                  ...session.currentTurn,
                  status: 'failed',
                  error: message.errors.join('\n'),
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
          }
        }
      } catch (error) {
        logger.error('Query error', error);
        currentProcess.stoppedPromise.reject(error);
      }
    };

    void daemon();

    return {
      messageGenerator,
      startedPromise: startedPromise.promise,
      stoppedPromise: stoppedPromise.promise,
    };
  };

  return {
    startSession: async (pendingSession) => {
      const { messageGenerator, startedPromise, stoppedPromise } = claudeCodeRun(pendingSession);

      messageGenerator.setNextMessage({
        text: pendingSession.firstPrompt,
      });

      const runningSession = await startedPromise;

      return {
        code: 'success',
        session: runningSession,
        stopped: stoppedPromise,
      };
    },

    // eslint-disable-next-line require-await
    continueSession: async (continueSession) => {
      let currentProcess = processMap.get(continueSession.sdkSessionId);

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

      currentProcess.messageGenerator.setNextMessage({
        text: continueSession.currentTurn.prompt,
      });
      startedPromise.resolve(continueSession);

      return {
        code: 'success',
        stopped: stoppedPromise.promise,
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

      const { messageGenerator, stoppedPromise } = claudeCodeRun(resumeSession);

      // 最初のユーザーメッセージを送信してconversationを再開
      messageGenerator.setNextMessage({
        text: resumeSession.currentTurn.prompt,
      });

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
        logger.info('ClaudeAgentSDKAdapter is already cleaned up');
        return;
      }
      isCleanedUp = true;

      logger.info('Cleaning up ClaudeAgentSDKAdapter...');

      // 全セッションの中断
      await Promise.allSettled(
        Array.from(processMap.entries()).map(([sessionId, process]) => {
          process.abortController.abort();
          logger.info(`Session aborted during cleanup: ${sessionId}`);
        }),
      );

      processMap.clear();
      logger.info('ClaudeAgentSDKAdapter cleaned up');
    },
  };
};
