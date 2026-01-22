import { logger } from '../../lib/logger';
import { getState, saveState } from '../../state';
import { stopServerProcess } from './stopServerProcess';

/**
 * サーバーを停止し、状態を更新
 */
export const stopServer = (): boolean => {
  const state = getState();

  if (!state.server || state.server.status !== 'running') {
    logger.info('Server is not running');
    return false;
  }

  const { pid, port, host } = state.server;

  logger.info(`Stopping server at http://${host}:${port} (pid: ${pid})...`);

  const stopped = stopServerProcess(pid);

  if (stopped) {
    saveState({
      server: {
        status: 'closed',
        port,
        host,
      },
    });
    logger.info('Server stopped successfully');
    return true;
  }

  logger.error('Failed to stop server');
  return false;
};
