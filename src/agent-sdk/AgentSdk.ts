import { type StandardJSONSchemaV1 } from '@standard-schema/spec';
import { ClaudeAgentSDKAdapter } from './adapters/claude/ClaudeAgentSDKAdapter';
import { CodexAgentSDKAdapter } from './adapters/codex/CodexAgentSDKAdapterService';
import { CopilotAgentSDKAdapter } from './adapters/copilot/CopilotAgentSDKAdapterService';
import { GeminiAgentSDKAdapter } from './adapters/gemini-cli/GeminiAgentSDKAdapterService';
import {
  type RunningSession,
  type PendingSession,
  type QueuedTurn,
  type Session,
  type PausedSession,
  type FailedSession,
  type SdkType,
  type StartSessionInput,
  type ContinueSessionInput,
  type ResumeSessionInput,
} from './types';

export const AgentSdk = () => {
  const claudeAgentSDKAdapter = ClaudeAgentSDKAdapter();
  const codexAgentSDKAdapter = CodexAgentSDKAdapter();
  const copilotAgentSDKAdapter = CopilotAgentSDKAdapter();
  const geminiAgentSDKAdapter = GeminiAgentSDKAdapter();

  const getAdapter = (sdkType: SdkType) => {
    switch (sdkType) {
      case 'claude':
        return claudeAgentSDKAdapter;
      case 'codex':
        return codexAgentSDKAdapter;
      case 'copilot':
        return copilotAgentSDKAdapter;
      case 'gemini':
        return geminiAgentSDKAdapter;
      default: {
        sdkType satisfies never;
        throw new Error(`Invalid SDK type: ${String(sdkType)}`);
      }
    }
  };

  const sessionMap = new Map<
    string,
    {
      sdkType: SdkType;
      session: Session;
    }
  >();

  const onSessionStarted = (sdkType: SdkType) => (session: RunningSession) => {
    sessionMap.set(session.sdkSessionId, {
      sdkType,
      session,
    });
  };

  const onSessionStopped = (session: PausedSession | FailedSession) => {
    // DO Nothing yet
    if (session.sdkSessionId !== undefined) {
      sessionMap.set(session.sdkSessionId, {
        sdkType: session.sdkType,
        session,
      });
    }
  };

  /**
   * セッションを開始する
   */
  const startSession = async <const O extends StandardJSONSchemaV1 | undefined>(
    input: StartSessionInput<O>,
  ) => {
    const adapter = getAdapter(input.sdkType);
    const taskId = crypto.randomUUID();

    const jsonSchema =
      input.outputSchema === undefined
        ? undefined
        : input.outputSchema['~standard'].jsonSchema.input({
            target: 'draft-07',
          });

    const queuedTurn: QueuedTurn = {
      id: taskId,
      status: 'queued',
      prompt: input.prompt,
      model: input.model,
      outputSchema: jsonSchema,
    };

    const pendingSession: PendingSession = {
      sdkType: input.sdkType,
      status: 'pending',
      firstPrompt: input.prompt,
      cwd: input.cwd,
      currentTurn: queuedTurn,
      turns: [queuedTurn],
    };

    const { session, stopped } = await adapter.startSession(pendingSession);

    onSessionStarted(input.sdkType)(session);
    void stopped.then(onSessionStopped);

    return {
      code: 'success',
      session,
      stopped,
    } as const;
  };

  const prompt = async (input: StartSessionInput) => {
    const { stopped } = await startSession(input);
    const stoppedSession = await stopped;
    return stoppedSession;
  };

  const continueSessionRaw = async (input: ContinueSessionInput) => {
    const session = sessionMap.get(input.sdkSessionId);
    if (!session) {
      return {
        code: 'session-not-found',
      } as const;
    }

    const adapter = getAdapter(session.sdkType);

    if (session.session.status !== 'paused') {
      return {
        code: 'session-illegal-state',
      } as const;
    }

    const queuedTurn: QueuedTurn = {
      id: crypto.randomUUID(),
      status: 'queued',
      prompt: input.prompt,
    };

    const runningSession: RunningSession = {
      ...session.session,
      status: 'running',
      currentTurn: queuedTurn,
      turns: [...session.session.turns, queuedTurn],
    };

    const result = await adapter.continueSession(runningSession);
    if (result.code !== 'success') {
      return result;
    }

    const { stopped } = result;

    onSessionStarted(session.sdkType)(runningSession);
    void stopped.then(onSessionStopped);

    return {
      code: 'success',
      session: runningSession,
      stopped,
    } as const;
  };

  const resumeSessionRaw = async (input: ResumeSessionInput) => {
    const adapter = getAdapter(input.sdkType);

    const queuedTurn: QueuedTurn = {
      id: crypto.randomUUID(),
      status: 'queued',
      prompt: input.prompt,
      model: input.model,
    };

    const runningSession: RunningSession = {
      sdkType: input.sdkType,
      status: 'running',
      sdkSessionId: input.sdkSessionId,
      firstPrompt: input.prompt,
      cwd: input.cwd,
      currentTurn: queuedTurn,
      turns: [queuedTurn],
    };

    const result = await adapter.resumeSession(runningSession);
    if (result.code !== 'success') {
      return result;
    }

    const { stopped } = result;

    onSessionStarted(input.sdkType)(runningSession);
    void stopped.then(onSessionStopped);

    return {
      session: runningSession,
      stopped,
    } as const;
  };

  const resumeSession = async (input: ResumeSessionInput) => {
    const savedSession = sessionMap.get(input.sdkSessionId);
    if (
      savedSession !== undefined &&
      (savedSession.session.status === 'pending' || savedSession.session.status === 'running')
    ) {
      return {
        code: 'session-illegal-state',
        kind: 'not-resume-in-progress-session',
      } as const;
    }

    const queuedTurn: QueuedTurn = {
      id: crypto.randomUUID(),
      status: 'queued',
      prompt: input.prompt,
    };

    const runningSession: RunningSession = {
      sdkType: savedSession?.session.sdkType ?? input.sdkType,
      status: 'running',
      sdkSessionId: input.sdkSessionId,
      firstPrompt: savedSession?.session.firstPrompt ?? input.prompt,
      cwd: savedSession?.session.cwd ?? input.cwd,
      currentTurn: queuedTurn,
      turns: [...(savedSession?.session.turns ?? []), queuedTurn],
    };

    const adapter = getAdapter(savedSession?.sdkType ?? input.sdkType);

    const result =
      savedSession !== undefined && savedSession.session.status === 'paused'
        ? // continue session
          await adapter.continueSession(runningSession)
        : // resume session
          await adapter.resumeSession(runningSession);

    if (result.code !== 'success') {
      return result;
    }

    const { stopped } = result;

    onSessionStarted(runningSession.sdkType)(runningSession);
    void stopped.then(onSessionStopped);

    return {
      code: 'success',
      session: runningSession,
      stopped,
    } as const;
  };

  const abortSession = (input: { sdkSessionId: string }) => {
    const session = sessionMap.get(input.sdkSessionId);
    if (!session) {
      return {
        code: 'session-not-found',
      } as const;
    }

    const adapter = getAdapter(session.sdkType);
    return adapter.abortSession({
      sdkSessionId: input.sdkSessionId,
    });
  };

  const aliveSessions = () =>
    Array.from(sessionMap.values()).filter(
      (session) => session.session.status !== 'completed' && session.session.status !== 'failed',
    );

  const cleanUp = async () => {
    await Promise.allSettled([
      claudeAgentSDKAdapter.cleanUp(),
      codexAgentSDKAdapter.cleanUp(),
      copilotAgentSDKAdapter.cleanUp(),
      geminiAgentSDKAdapter.cleanUp(),
    ]);
  };

  return {
    prompt,
    startSession,
    continueSessionRaw,
    resumeSessionRaw,
    resumeSession,
    abortSession,
    aliveSessions,
    cleanUp,
  } as const;
};
