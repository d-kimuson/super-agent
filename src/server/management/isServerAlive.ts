import { honoClient } from '../../client';

/**
 * サーバーが生きているかチェック
 */
export const isServerAlive = async (port: number): Promise<boolean> => {
  try {
    const response = await honoClient(port).system.health.$get();
    const data = await response.json();
    return data.status === 'healthy' && data.server === 'agent-bridge';
  } catch {
    return false;
  }
};
