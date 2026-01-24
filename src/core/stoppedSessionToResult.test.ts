import { describe, expect, it } from 'vitest';
import { type FailedSession, type PausedSession } from '../agent-sdk/types';
import { stoppedSessionToResult } from './stoppedSessionToResult';

const createBasePausedSession = (overrides: Partial<PausedSession> = {}): PausedSession => ({
  sdkType: 'claude',
  status: 'paused',
  sdkSessionId: 'session-123',
  firstPrompt: 'initial prompt',
  cwd: '/home/user',
  currentTurn: {
    id: 'turn-1',
    status: 'completed',
    prompt: 'user prompt',
    output: 'agent output',
  },
  turns: [],
  ...overrides,
});

const createBaseFailedSession = (overrides: Partial<FailedSession> = {}): FailedSession => ({
  sdkType: 'claude',
  status: 'failed',
  sdkSessionId: 'session-123',
  firstPrompt: 'initial prompt',
  cwd: '/home/user',
  turns: [],
  error: new Error('Something went wrong'),
  ...overrides,
});

describe('stoppedSessionToResult', () => {
  describe('paused session with completed turn', () => {
    it('returns success result with output', () => {
      const session = createBasePausedSession({
        currentTurn: {
          id: 'turn-1',
          status: 'completed',
          prompt: 'user prompt',
          output: 'This is the agent output.',
        },
      });

      const result = stoppedSessionToResult(session);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('This is the agent output.');
        expect(result.sessionId).toBe('session-123');
      }
    });

    it('includes resume message with sessionId', () => {
      const session = createBasePausedSession({
        sdkSessionId: 'abc-123',
        currentTurn: {
          id: 'turn-1',
          status: 'completed',
          prompt: 'prompt',
          output: 'output',
        },
      });

      const result = stoppedSessionToResult(session);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('resume=abc-123');
      }
    });
  });

  describe('paused session with failed turn', () => {
    it('returns failure result with turn-failed code', () => {
      const session = createBasePausedSession({
        currentTurn: {
          id: 'turn-1',
          status: 'failed',
          prompt: 'user prompt',
          error: new Error('Turn failed'),
        },
      });

      const result = stoppedSessionToResult(session);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('turn-failed');
        expect(result.message).toContain('Turn failed');
        expect(result.sessionId).toBe('session-123');
      }
    });

    it('handles non-Error objects in turn error', () => {
      const session = createBasePausedSession({
        currentTurn: {
          id: 'turn-1',
          status: 'failed',
          prompt: 'user prompt',
          error: 'String error message',
        },
      });

      const result = stoppedSessionToResult(session);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toContain('String error message');
      }
    });
  });

  describe('failed session', () => {
    it('returns failure result with session-failed code', () => {
      const session = createBaseFailedSession({
        error: new Error('Session crashed'),
      });

      const result = stoppedSessionToResult(session);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('session-failed');
        expect(result.message).toContain('Session crashed');
      }
    });

    it('includes sessionId when available', () => {
      const session = createBaseFailedSession({
        sdkSessionId: 'failed-session-id',
      });

      const result = stoppedSessionToResult(session);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.sessionId).toBe('failed-session-id');
        expect(result.message).toContain('resume=failed-session-id');
      }
    });

    it('handles missing sessionId', () => {
      const session: FailedSession = {
        sdkType: 'claude',
        status: 'failed',
        sdkSessionId: undefined,
        firstPrompt: 'initial prompt',
        cwd: '/home/user',
        turns: [],
        error: new Error('Early failure'),
      };

      const result = stoppedSessionToResult(session);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.sessionId).toBe('');
        expect(result.message).not.toContain('resume=');
      }
    });

    it('handles non-Error objects in session error', () => {
      const session = createBaseFailedSession({
        error: { code: 'CUSTOM_ERROR', details: 'Custom error object' },
      });

      const result = stoppedSessionToResult(session);

      expect(result.success).toBe(false);
      if (!result.success) {
        // Object.toString() behavior
        expect(result.message).toContain('[object Object]');
      }
    });

    it('handles null/undefined session error', () => {
      const session = createBaseFailedSession({
        error: null,
      });

      const result = stoppedSessionToResult(session);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.message).toContain('null');
      }
    });
  });

  describe('resume message format', () => {
    it('appends resume instruction after separator', () => {
      const session = createBasePausedSession({
        sdkSessionId: 'test-session',
        currentTurn: {
          id: 'turn-1',
          status: 'completed',
          prompt: 'prompt',
          output: 'output',
        },
      });

      const result = stoppedSessionToResult(session);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('\n\n---\n\n');
        expect(result.message).toContain("'agent-task' tool");
      }
    });
  });
});
