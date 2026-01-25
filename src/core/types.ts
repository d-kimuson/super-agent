import { type SdkType } from '../agent-sdk/types';

export type ToolResult =
  | { success: true; sessionId: string; message: string; sdkType: SdkType }
  | { success: false; code: string; message: string; sessionId?: string };
