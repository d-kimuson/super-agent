import { describe, expect, it } from 'vitest';
import { type ToolResult } from '../core/types';
import { mapToolResultToMcpResponse } from './mapToolResultToMcpResponse';

describe('mapToolResultToMcpResponse', () => {
  describe('success result', () => {
    it('maps successful result to MCP response', () => {
      const result: ToolResult = {
        success: true,
        sessionId: 'session-123',
        message: 'Task completed successfully',
        sdkType: 'claude',
      };

      const response = mapToolResultToMcpResponse(result);

      expect(response.isError).toBe(false);
      expect(response.content).toEqual([{ type: 'text', text: 'Task completed successfully' }]);
    });

    it('preserves message content exactly', () => {
      const result: ToolResult = {
        success: true,
        sessionId: 'id',
        message: 'Message with\nnewlines\tand\ttabs',
        sdkType: 'claude',
      };

      const response = mapToolResultToMcpResponse(result);

      expect(response.content[0]?.text).toBe('Message with\nnewlines\tand\ttabs');
    });

    it('handles empty message', () => {
      const result: ToolResult = {
        success: true,
        sessionId: 'id',
        message: '',
        sdkType: 'claude',
      };

      const response = mapToolResultToMcpResponse(result);

      expect(response.isError).toBe(false);
      expect(response.content[0]?.text).toBe('');
    });
  });

  describe('failure result', () => {
    it('maps failed result to MCP error response', () => {
      const result: ToolResult = {
        success: false,
        code: 'agent-not-found',
        message: 'Agent "unknown" not found',
      };

      const response = mapToolResultToMcpResponse(result);

      expect(response.isError).toBe(true);
      expect(response.content).toEqual([{ type: 'text', text: 'Agent "unknown" not found' }]);
    });

    it('handles failure with sessionId', () => {
      const result: ToolResult = {
        success: false,
        code: 'session-failed',
        message: 'Session failed',
        sessionId: 'failed-session',
      };

      const response = mapToolResultToMcpResponse(result);

      expect(response.isError).toBe(true);
      expect(response.content[0]?.text).toBe('Session failed');
    });

    it('preserves error message exactly', () => {
      const result: ToolResult = {
        success: false,
        code: 'error',
        message: 'Error: something went wrong\n\nStack trace here',
      };

      const response = mapToolResultToMcpResponse(result);

      expect(response.content[0]?.text).toBe('Error: something went wrong\n\nStack trace here');
    });
  });

  describe('response structure', () => {
    it('always returns single content item', () => {
      const successResult: ToolResult = {
        success: true,
        sessionId: 'id',
        message: 'success',
        sdkType: 'claude',
      };
      const failureResult: ToolResult = {
        success: false,
        code: 'error',
        message: 'failure',
      };

      expect(mapToolResultToMcpResponse(successResult).content).toHaveLength(1);
      expect(mapToolResultToMcpResponse(failureResult).content).toHaveLength(1);
    });

    it('content type is always text', () => {
      const result: ToolResult = {
        success: true,
        sessionId: 'id',
        message: 'test',
        sdkType: 'claude',
      };

      const response = mapToolResultToMcpResponse(result);

      expect(response.content[0]?.type).toBe('text');
    });
  });
});
