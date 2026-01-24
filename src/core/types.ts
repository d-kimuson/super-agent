export type ToolResult =
  | { success: true; sessionId: string; message: string }
  | { success: false; code: string; message: string; sessionId?: string };
