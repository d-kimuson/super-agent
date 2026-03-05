import { type SdkType } from '../agent-sdk/types';

export type ToolResult<O> =
  | { status: 'success'; sessionId: string; message: string; sdkType: SdkType; structured: O }
  | { status: 'run-in-background'; sessionId: string; message: string; sdkType: SdkType }
  | { status: 'failed'; code: string; message: string; sessionId?: string };
