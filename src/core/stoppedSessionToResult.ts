import { type PausedSession, type FailedSession } from '../agent-sdk/types';
import { errorToString } from '../lib/errorToString';
import { type ToolResult } from './types';

export const stoppedSessionToResult = (
  session: PausedSession | FailedSession,
): ToolResult<unknown> => {
  const sdkSessionId = session.sdkSessionId ?? '';
  const resumeMessage =
    sdkSessionId.length > 0
      ? `To continue the conversation, use the 'agent-task' tool again with the resume=${sdkSessionId}.`
      : '';

  const fallbackMessage = `If the error is related to rate limits, authentication, or provider availability, you can specify the sdkType in disabledSdkTypes to fallback to a different model. In this case, do not use resume and start a new agent-task instead.`;

  if (session.status === 'paused') {
    if (session.currentTurn.status === 'completed') {
      return {
        status: 'success',
        message: session.currentTurn.output + '\n\n---\n\n' + resumeMessage,
        sessionId: sdkSessionId,
        sdkType: session.sdkType,
        // eslint-disable-next-line no-deprecated
        structured: session.currentTurn.structuredOutput,
      };
    } else {
      const errorMessage = `An error occurred: ${errorToString(session.currentTurn.error)}`;
      return {
        status: 'failed',
        code: 'turn-failed',
        message: `${errorMessage}\n\n---\n\n${fallbackMessage}\n\n${resumeMessage}`,
        sessionId: sdkSessionId,
      };
    }
  }

  const errorMessage = `An error occurred: ${errorToString(session.error)}`;
  return {
    status: 'failed',
    code: 'session-failed',
    message:
      resumeMessage.length > 0
        ? `${errorMessage}\n\n---\n\n${fallbackMessage}\n\n${resumeMessage}`
        : `${errorMessage}\n\n---\n\n${fallbackMessage}`,
    sessionId: sdkSessionId,
  };
};
