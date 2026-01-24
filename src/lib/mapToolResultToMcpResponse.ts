import type { ToolResult } from '../core/types';

export const mapToolResultToMcpResponse = (
  result: ToolResult,
): {
  isError: boolean;
  content: { type: 'text'; text: string }[];
} => {
  if (result.success) {
    return {
      isError: false,
      content: [{ type: 'text', text: result.message }],
    };
  } else {
    return {
      isError: true,
      content: [{ type: 'text', text: result.message }],
    };
  }
};
