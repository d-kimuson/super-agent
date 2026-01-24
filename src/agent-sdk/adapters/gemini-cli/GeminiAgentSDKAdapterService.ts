import { spawn } from 'node:child_process';
import { z } from 'zod';
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

const defaultModel = 'auto-gemini-2.5';

// Gemini CLI の stream-json 出力スキーマ
const geminiStreamMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('init'),
    timestamp: z.string(),
    session_id: z.string(),
    model: z.string(),
  }),
  z.object({
    type: z.literal('message'),
    timestamp: z.string(),
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    delta: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('result'),
    timestamp: z.string(),
    status: z.enum(['success', 'error']),
    stats: z.object({
      total_tokens: z.number(),
      input_tokens: z.number(),
      output_tokens: z.number(),
      cached: z.number(),
      input: z.number(),
      duration_ms: z.number(),
      tool_calls: z.number(),
    }),
  }),
]);

type PendingSessionProcess = {
  status: 'pending';
  abortController: AbortController;
  startedPromise: ControllablePromise<RunningSession>;
  stoppedPromise: ControllablePromise<PausedSession | FailedSession>;
};

type RunningSessionProcess = Omit<PendingSessionProcess, 'status'> & {
  status: 'running';
  sdkSessionId: string;
};

type SessionProcess = PendingSessionProcess | RunningSessionProcess;

export const GeminiAgentSDKAdapter = (): AgentSDKAdapter => {
  const processMap = new Map<string, SessionProcess>();
  let isCleanedUp = false;

  const geminiRun = (session: PendingSession | RunningSession) => {
    const abortController = new AbortController();
    const startedPromise = createControllablePromise<RunningSession>();
    const stoppedPromise = createControllablePromise<PausedSession | FailedSession>();

    let currentProcess: SessionProcess = {
      status: 'pending',
      abortController,
      startedPromise,
      stoppedPromise,
    };

    const daemon = () => {
      try {
        const args = [
          '--approval-mode',
          'yolo',
          '--output-format',
          'stream-json',
          '--model',
          session.currentTurn.model ?? defaultModel,
          ...(session.status === 'running' ? ['--resume', session.sdkSessionId] : []),
          session.currentTurn.prompt,
        ];

        const child = spawn('gemini', args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
        });

        let buffer = '';
        let assistantMessages: string[] = [];
        let sdkSessionId: string | undefined = undefined;
        let stderrBuffer = '';

        child.stdout.on('data', (data: Buffer) => {
          if (abortController.signal.aborted) {
            child.kill();
            return;
          }

          buffer += data.toString('utf-8');
          const lines = buffer.split('\n');
          // 最後の行は不完全な可能性があるので保持
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.trim() === '' || !line.startsWith('{')) {
              continue;
            }

            try {
              const json: unknown = JSON.parse(line);
              const parseResult = geminiStreamMessageSchema.safeParse(json);

              if (!parseResult.success) {
                // JSON としてパースできたが、スキーマに合わない場合はスキップ
                continue;
              }

              const message = parseResult.data;
              logger.info(`[GeminiCLI] ${message.type}`);

              // sync currentProcess
              if (currentProcess.status === 'running') {
                currentProcess = {
                  ...(processMap.get(currentProcess.sdkSessionId) ?? currentProcess),
                };
              }

              if (message.type === 'init') {
                sdkSessionId = message.session_id;
                // init の時点で assistant メッセージをリセット
                assistantMessages = [];

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

              if (message.type === 'message' && message.role === 'assistant') {
                // assistant メッセージを配列に追加
                assistantMessages.push(message.content);
                continue;
              }

              if (message.type === 'result') {
                if (currentProcess.status === 'pending') {
                  throw new Error('process not initialized');
                }

                if (sdkSessionId === undefined || sdkSessionId === '') {
                  throw new Error('sdkSessionId must be defined');
                }

                if (message.status === 'success') {
                  // 全ての assistant メッセージを結合
                  const fullAssistantMessage = assistantMessages.join('');

                  if (fullAssistantMessage === '') {
                    throw new Error('assistantMessages must not be empty');
                  }

                  const nextTurn: CompletedTurn = {
                    ...session.currentTurn,
                    status: 'completed',
                    output: fullAssistantMessage,
                  };

                  const nextSession: PausedSession = {
                    ...session,
                    status: 'paused',
                    sdkSessionId,
                    currentTurn: nextTurn,
                    turns: [
                      ...session.turns.filter((turn) => turn.id !== session.currentTurn.id),
                      nextTurn,
                    ],
                  };

                  currentProcess.stoppedPromise.resolve(nextSession);
                } else {
                  const errorMessage = stderrBuffer.trim()
                    ? `Gemini CLI returned error status\n\nStderr:\n${stderrBuffer.trim()}`
                    : 'Gemini CLI returned error status';

                  const nextTurn: FailedTurn = {
                    ...session.currentTurn,
                    status: 'failed',
                    error: errorMessage,
                  };

                  const nextSession: PausedSession = {
                    ...session,
                    status: 'paused',
                    sdkSessionId: currentProcess.sdkSessionId,
                    currentTurn: nextTurn,
                    turns: [
                      ...session.turns.filter((turn) => turn.id !== session.currentTurn.id),
                      nextTurn,
                    ],
                  };

                  currentProcess.stoppedPromise.resolve(nextSession);
                }

                continue;
              }
            } catch (error) {
              logger.error('[GeminiCLI] Failed to parse message', error);
            }
          }
        });

        child.stderr.on('data', (data: Buffer) => {
          const stderrChunk = data.toString('utf-8');
          stderrBuffer += stderrChunk;
          logger.error('[GeminiCLI] stderr:', stderrChunk);
        });

        child.on('error', (error) => {
          logger.error('[GeminiCLI] Process error', error);
          const errorWithStderr = stderrBuffer.trim()
            ? new Error(`${error.message}\n\nStderr:\n${stderrBuffer.trim()}`)
            : error;
          currentProcess.stoppedPromise.reject(errorWithStderr);
        });

        child.on('close', (code) => {
          if (code !== 0 && !abortController.signal.aborted) {
            logger.error(`[GeminiCLI] Process exited with code ${code}`);
            const errorMessage = stderrBuffer.trim()
              ? `Gemini CLI process exited with code ${code}\n\nStderr:\n${stderrBuffer.trim()}`
              : `Gemini CLI process exited with code ${code}`;
            currentProcess.stoppedPromise.reject(new Error(errorMessage));
          }
        });

        abortController.signal.addEventListener('abort', () => {
          child.kill();
        });
      } catch (error) {
        logger.error('[GeminiCLI] Error', error);
        currentProcess.stoppedPromise.reject(error);
      }
    };

    daemon();

    return {
      startedPromise: startedPromise.promise,
      stoppedPromise: stoppedPromise.promise,
    };
  };

  return {
    startSession: async (pendingSession) => {
      const { startedPromise, stoppedPromise } = geminiRun(pendingSession);

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

      // Gemini CLI は continue をサポートしていないため、resume と同じ実装
      const { stoppedPromise } = geminiRun(continueSession);

      return {
        code: 'success',
        stopped: stoppedPromise,
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

      // Gemini CLI は resume をサポートしているが、プロセスを維持できないため continue と同じ実装
      const { stoppedPromise } = geminiRun(resumeSession);

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

      // AbortController を使ってコマンドをキャンセル
      process.abortController.abort();

      // セッションを削除
      processMap.delete(input.sdkSessionId);

      logger.info(`[GeminiCLI] Session aborted: ${input.sdkSessionId}`);
      return {
        code: 'success',
      };
    },

    cleanUp: async () => {
      // 冪等性の保証: 複数回呼び出されても安全に動作
      if (isCleanedUp) {
        logger.info('[GeminiCLI] Already cleaned up');
        return;
      }
      isCleanedUp = true;

      logger.info('[GeminiCLI] Cleaning up...');

      // 全セッションの中断
      await Promise.allSettled(
        Array.from(processMap.entries()).map(([sessionId, process]) => {
          process.abortController.abort();
          logger.info(`[GeminiCLI] Session aborted during cleanup: ${sessionId}`);
        }),
      );

      processMap.clear();
      logger.info('[GeminiCLI] Cleaned up');
    },
  };
};
