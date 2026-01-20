import { CopilotClient, type SessionConfig, type CopilotSession } from '@github/copilot-sdk';
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
  type Turn,
} from '../../types';
import { type AgentSDKAdapter } from '../types';

const sessionConfig: SessionConfig = {
  streaming: true,
};

const defaultModel = 'claude-sonnet-4.5';

type PendingSessionProcess = {
  status: 'pending';
  copilotSession: CopilotSession;
  startedPromise: ControllablePromise<RunningSession>;
  stoppedPromise: ControllablePromise<PausedSession | FailedSession>;
};

type RunningSessionProcess = Omit<PendingSessionProcess, 'status'> & {
  status: 'running';
  sdkSessionId: string;
  unsubscribe: () => void;
};

type SessionProcess = PendingSessionProcess | RunningSessionProcess;

export const CopilotAgentSDKAdapter = (): AgentSDKAdapter => {
  const client = new CopilotClient();
  let isStarted = false;

  const processMap = new Map<string, SessionProcess>();
  let isCleanedUp = false;

  /**
   * クライアントが未初期化の場合に start() を呼び出す
   * 初回のみ実行され、2回目以降は何もしない
   */
  const ensureClientStarted = async () => {
    if (isStarted) {
      return;
    }

    await client.start();
    isStarted = true;
    logger.info('CopilotClient started');
  };

  const copilotRun = (session: RunningSession, copilotSession: CopilotSession) => {
    const stoppedPromise = createControllablePromise<PausedSession | FailedSession>();

    let currentProcess: SessionProcess = {
      status: 'pending',
      copilotSession,
      startedPromise: createControllablePromise<RunningSession>(),
      stoppedPromise,
    };

    let assistantMessages: string[] = [];

    // イベントハンドラを設定
    const unsubscribeHandler = copilotSession.on((event) => {
      // sync currentProcess
      if (currentProcess.status === 'running') {
        currentProcess = {
          ...(processMap.get(currentProcess.sdkSessionId) ?? currentProcess),
        };
      }

      if (event.type === 'assistant.turn_start') {
        // 新しいターンの開始時にメッセージをリセット
        assistantMessages = [];
      } else if (event.type === 'assistant.message') {
        // assistant メッセージを配列に追加
        assistantMessages.push(event.data.content);
      } else if (event.type === 'session.idle') {
        // 全ての assistant メッセージを結合
        const fullAssistantMessage = assistantMessages.join('');

        if (fullAssistantMessage === '') {
          logger.error('assistantMessages must not be empty');
          return;
        }

        const nextTurn: CompletedTurn = {
          ...session.currentTurn,
          status: 'completed',
          output: fullAssistantMessage,
        };

        const nextSession: PausedSession = {
          ...session,
          status: 'paused',
          currentTurn: nextTurn,
          turns: [
            ...session.turns.filter((task: Turn) => task.id !== session.currentTurn.id),
            nextTurn,
          ],
        };

        currentProcess.stoppedPromise.resolve(nextSession);

        currentProcess = {
          ...currentProcess,
          status: 'running',
          unsubscribe: unsubscribeHandler,
          sdkSessionId: session.sdkSessionId,
        };

        processMap.set(session.sdkSessionId, currentProcess);
      } else if (event.type === 'session.error') {
        logger.error('Copilot session error', event);

        const nextTurn: FailedTurn = {
          ...session.currentTurn,
          status: 'failed',
          error: event,
        };

        const nextSession: FailedSession = {
          ...session,
          status: 'failed',
          currentTurn: nextTurn,
          turns: [
            ...session.turns.filter((task: Turn) => task.id !== session.currentTurn.id),
            nextTurn,
          ],
          error: event,
        };

        currentProcess.stoppedPromise.resolve(nextSession);

        currentProcess = {
          ...currentProcess,
          status: 'running',
          unsubscribe: unsubscribeHandler,
          sdkSessionId: session.sdkSessionId,
        };

        processMap.set(session.sdkSessionId, currentProcess);
      }
    });

    return {
      session,
      stoppedPromise: stoppedPromise.promise,
    };
  };

  return {
    startSession: async (pendingSession) => {
      await ensureClientStarted();

      const sdkSessionId = crypto.randomUUID();

      const session: RunningSession = {
        ...pendingSession,
        status: 'running',
        sdkSessionId,
      };

      const copilotSession = await client.createSession({
        ...sessionConfig,
        sessionId: sdkSessionId,
        model: session.currentTurn.model ?? defaultModel,
      });

      const { stoppedPromise } = copilotRun(session, copilotSession);

      const daemon = async () => {
        try {
          await copilotSession.send({ prompt: pendingSession.firstPrompt });
        } catch (error) {
          logger.error('Failed to send prompt', error);

          const nextTurn: FailedTurn = {
            ...pendingSession.currentTurn,
            status: 'failed',
            error,
          };

          const nextSession: FailedSession = {
            ...pendingSession,
            status: 'failed',
            sdkSessionId,
            currentTurn: nextTurn,
            turns: [
              ...pendingSession.turns.filter((task) => task.id !== pendingSession.currentTurn.id),
              nextTurn,
            ],
            error,
          };

          const process = processMap.get(sdkSessionId);
          process?.stoppedPromise.resolve(nextSession);
        }
      };

      void daemon();

      return {
        code: 'success',
        session,
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

      const stoppedPromise = createControllablePromise<PausedSession | FailedSession>();

      processMap.set(continueSession.sdkSessionId, {
        ...currentProcess,
        stoppedPromise,
      });

      void currentProcess.copilotSession.send({
        prompt: continueSession.currentTurn.prompt,
      });

      return {
        code: 'success',
        stopped: stoppedPromise.promise,
      };
    },

    resumeSession: async (resumeSession) => {
      // Validate that sdkSessionId exists
      if (resumeSession.sdkSessionId === undefined) {
        return {
          code: 'session-illegal-state',
        };
      }

      await ensureClientStarted();

      const copilotSession = await client.resumeSession(resumeSession.sdkSessionId, sessionConfig);

      const { stoppedPromise } = copilotRun(resumeSession, copilotSession);

      const daemon = async () => {
        try {
          await copilotSession.send({ prompt: resumeSession.currentTurn.prompt });
        } catch (error) {
          logger.error('Failed to send prompt', error);

          const nextTurn: FailedTurn = {
            ...resumeSession.currentTurn,
            status: 'failed',
            error,
          };

          const nextSession: FailedSession = {
            ...resumeSession,
            status: 'failed',
            sdkSessionId: resumeSession.sdkSessionId,
            currentTurn: nextTurn,
            turns: [
              ...resumeSession.turns.filter((task) => task.id !== resumeSession.currentTurn.id),
              nextTurn,
            ],
            error,
          };

          const process = processMap.get(resumeSession.sdkSessionId);
          process?.stoppedPromise.resolve(nextSession);
        }
      };

      void daemon();

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

      // Copilot SDK の abort() を呼び出す
      void process.copilotSession.abort().catch((error: unknown) => {
        logger.error('Failed to abort session', error);
      });

      // イベントリスナーの解除
      if (process.status === 'running') {
        process.unsubscribe();
      }

      // セッションを削除
      processMap.delete(input.sdkSessionId);

      logger.info(`Session aborted: ${input.sdkSessionId}`);
      return {
        code: 'success',
      };
    },

    cleanUp: async () => {
      // 冪等性の保証
      if (isCleanedUp) {
        logger.info('CopilotAgentSDKAdapter is already cleaned up');
        return;
      }
      isCleanedUp = true;

      logger.info('Cleaning up CopilotAgentSDKAdapter...');

      // 全セッションの中断
      await Promise.allSettled(
        Array.from(processMap.entries()).map(async ([sessionId, process]) => {
          // イベントリスナーの解除
          if (process.status === 'running') {
            process.unsubscribe();
            logger.info(`Event listener unsubscribed for session: ${sessionId}`);
          }

          // セッションの中断
          try {
            await process.copilotSession.abort();
          } catch (error) {
            logger.error(`Error during session abort for ${sessionId}`, error);
          }
        }),
      );

      processMap.clear();

      // CopilotClient の終了処理（起動されている場合のみ）
      if (isStarted) {
        try {
          await client.stop();
        } catch (error) {
          logger.error('Error during CopilotClient stop', error);
        }
      }

      logger.info('CopilotAgentSDKAdapter cleaned up');
    },
  };
};
