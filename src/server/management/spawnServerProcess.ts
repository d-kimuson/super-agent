import getPort from 'get-port';
import { spawn } from 'node:child_process';
import { logger } from '../../lib/logger';
import { saveState } from '../../state';
import { isServerAlive } from './isServerAlive';

/**
 * シェルから別プロセスとしてサーバーを起動する
 *
 * 現在実行中のプロセスと同じ方法（process.execPath + process.execArgv + process.argv）で
 * サーバーを起動することで、どんな実行方法でも確実に動作する
 */
export const spawnServerProcess = async (port: number, host: string): Promise<void> => {
  // 現在のプロセスと同じNode.jsバイナリと実行引数を使用
  // process.execPath: node の実行パス
  // process.execArgv: node のフラグ（例: --loader, --experimental-modules など）
  // process.argv[1]: 実行されたスクリプトのパス
  const execArgv = [...process.execArgv];
  const scriptPath = process.argv[1];

  if (scriptPath === undefined) {
    throw new Error('Could not determine script path from process.argv[1]');
  }

  // CLI の引数を構築: [スクリプトパス, 'server', 'start', ...]
  const args = [
    ...execArgv,
    scriptPath,
    'server',
    'start',
    '--port',
    port.toString(),
    '--hostname',
    host,
  ];

  logger.info(`Spawning server: ${process.execPath} ${args.join(' ')}`);

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: 'ignore',
  });

  // 親プロセスから切り離す
  child.unref();

  if (child.pid === undefined) {
    throw new Error('Failed to spawn server process');
  }

  logger.info(`Server process spawned with pid: ${child.pid}`);

  // 状態を保存
  saveState({
    server: {
      status: 'running',
      pid: child.pid,
      port,
      host,
    },
  });

  // サーバーが起動するまで待機
  const maxRetries = 30;
  const retryInterval = 100; // ms

  for (let i = 0; i < maxRetries; i++) {
    if (await isServerAlive(port)) {
      logger.info(`Server is ready at http://${host}:${port}`);
      // サーバーが起動したので、ポートをロックする
      await getPort({ port });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, retryInterval));
  }

  throw new Error('Server failed to start within timeout');
};
