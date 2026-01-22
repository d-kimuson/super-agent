import { logger } from '../../lib/logger';

/**
 * サーバープロセスを停止
 */
export const stopServerProcess = (pid: number): boolean => {
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch (error) {
    logger.error(`Failed to stop server process ${pid}:`, error);
    return false;
  }
};
