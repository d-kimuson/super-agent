import getPort from 'get-port';
import { logger } from '../../lib/logger';
import { getState } from '../../state';
import { isServerAlive } from './isServerAlive';
import { spawnServerProcess } from './spawnServerProcess';

export const ensureServer = async (): Promise<void> => {
  const state = getState();

  // 既にサーバーが動いていて正常な場合はそのまま返す
  if (state.server?.status === 'running') {
    if (await isServerAlive(state.server.port)) {
      logger.info(`Server is already running at http://${state.server.host}:${state.server.port}`);
      return;
    }
    // プロセスが落ちている場合は再起動
    logger.warn('Server process is not responding, restarting...');
    const port = await getPort({ port: state.server.port });
    const host = state.server.host;
    return await spawnServerProcess(port, host);
  }

  // サーバーを起動する
  const port =
    state.server?.status === 'closed'
      ? await getPort({ port: state.server.port })
      : await getPort({ port: 45456 });

  const host = state.server?.host ?? 'localhost';

  await spawnServerProcess(port, host);
};
