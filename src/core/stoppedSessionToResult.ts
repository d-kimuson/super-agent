import { type PausedSession, type FailedSession } from '../agent-sdk/types';
import { errorToString } from '../lib/errorToString';
import { type ToolResult } from './types';

export const stoppedSessionToResult = (session: PausedSession | FailedSession): ToolResult => {
  const resumeMessage =
    session.sdkSessionId !== undefined
      ? `To continue the conversation, use the 'agent-task' tool again with the resume=${session.sdkSessionId}.`
      : '';

  const fallbackMessage = `If the error is related to rate limits, authentication, or provider availability, you can specify the sdkType in disabledSdkTypes to fallback to a different model. In this case, do not use resume and start a new agent-task instead.`;

  if (session.status === 'paused') {
    if (session.currentTurn.status === 'completed') {
      return {
        success: true,
        message: session.currentTurn.output + '\n\n---\n\n' + resumeMessage,
        sessionId: session.sdkSessionId,
        sdkType: session.sdkType,
      } as const;
    } else {
      const errorMessage = `An error occurred: ${errorToString(session.currentTurn.error)}`;
      return {
        success: false,
        code: 'turn-failed',
        message: `${errorMessage}\n\n---\n\n${fallbackMessage}\n\n${resumeMessage}`,
        sessionId: session.sdkSessionId,
      } as const;
    }
  }

  const errorMessage = `An error occurred: ${errorToString(session.error)}`;
  return {
    success: false,
    code: 'session-failed',
    message: `${errorMessage}\n\n---\n\n${fallbackMessage}`,
    sessionId: session.sdkSessionId,
  } as const;
};
