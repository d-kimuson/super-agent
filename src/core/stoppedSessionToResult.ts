import { type PausedSession, type FailedSession } from '../agent-sdk/types';
import { errorToString } from '../lib/errorToString';
import { type ToolResult } from './types';

export const stoppedSessionToResult = (session: PausedSession | FailedSession): ToolResult => {
  const sessionId = session.sdkSessionId ?? '';
  const resumeMessage = sessionId
    ? `To continue the conversation, use the 'agent-task' tool again with the resume=${sessionId}.`
    : '';

  if (session.status === 'paused') {
    if (session.currentTurn.status === 'completed') {
      return {
        success: true,
        message: session.currentTurn.output + '\n\n---\n\n' + resumeMessage,
        sessionId,
        sdkType: session.sdkType,
      } as const;
    } else {
      return {
        success: false,
        code: 'turn-failed',
        message: errorToString(session.currentTurn.error) + '\n\n---\n\n' + resumeMessage,
        sessionId,
      } as const;
    }
  }

  return {
    success: false,
    code: 'session-failed',
    message: errorToString(session.error) + '\n\n---\n\n' + resumeMessage,
    sessionId,
  } as const;
};
