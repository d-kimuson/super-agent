import { Command } from 'commander';
import { logger } from '../../lib/logger';
import { ensureServer } from '../../server/management/ensureServer';
import { isServerAlive } from '../../server/management/isServerAlive';
import { stopServer } from '../../server/management/stopServer';
import { getState } from '../../state';

export const createServerCommand = () => {
  const serverCommand = new Command('server');
  serverCommand.description('HTTP server management');

  // server start
  serverCommand
    .command('start')
    .description('Start HTTP server')
    .option('-p, --port <port>', 'Port to listen on', '3000')
    .option('-h, --hostname <hostname>', 'Hostname to bind to', '127.0.0.1')
    .action(async (options: { port: string; hostname: string }) => {
      try {
        const state = getState();

        // 既にサーバーが動いているかチェック
        if (state.server?.status === 'running') {
          const alive = await isServerAlive(state.server.port);
          if (alive) {
            logger.info(
              `Server is already running at http://${state.server.host}:${state.server.port} (pid: ${state.server.pid})`,
            );
            return;
          }
          logger.warn('Server process is not responding, starting new server...');
        }

        // 設定を読み込む
        const { loadConfig } = await import('../../config/loadConfig');
        const { paths } = await import('../../lib/paths');

        logger.info('Loading configuration...');

        const config = await loadConfig({
          configPath: paths.configFile,
          agentDirs: [paths.agentsDir],
          skillDirs: [paths.skillsDir],
        });

        logger.info(`Loaded ${config.agents.length} agent(s), ${config.skills.length} skill(s)`);

        if (config.agents.length === 0) {
          logger.warn('No agents found. Please check your agent directories.');
        }

        const port = Number.parseInt(options.port, 10);
        logger.info(`Starting HTTP server on ${options.hostname}:${port}...`);

        // サーバーを直接起動
        const { startServer } = await import('../../server');
        startServer({
          config,
          port,
          hostname: options.hostname,
        });

        logger.info(`Server started at http://${options.hostname}:${port}`);
      } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
      }
    });

  // server stop
  serverCommand
    .command('stop')
    .description('Stop running HTTP server')
    .action(() => {
      try {
        const stopped = stopServer();
        if (!stopped) {
          process.exit(1);
        }
      } catch (error) {
        logger.error('Failed to stop server:', error);
        process.exit(1);
      }
    });

  // server restart
  serverCommand
    .command('restart')
    .description('Restart HTTP server')
    .action(async () => {
      try {
        // 停止
        stopServer();

        const state = getState();
        if (state.server?.status === 'closed') {
          // サーバーが完全に停止するまで少し待つ
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // 起動
        logger.info('Starting server...');
        await ensureServer();
      } catch (error) {
        logger.error('Failed to restart server:', error);
        process.exit(1);
      }
    });

  // server status
  serverCommand
    .command('status')
    .description('Show HTTP server status')
    .action(async () => {
      try {
        const state = getState();

        if (!state.server) {
          logger.info('Server has not been started yet');
          return;
        }

        const { status, port, host } = state.server;

        if (status === 'running') {
          const alive = await isServerAlive(port);
          if (alive) {
            logger.info(`Server is running at http://${host}:${port} (pid: ${state.server.pid})`);
          } else {
            logger.warn(
              `Server is marked as running (pid: ${state.server.pid}) but not responding at http://${host}:${port}`,
            );
            logger.info('Try running "super-subagents server restart" to fix this');
          }
        } else {
          logger.info(`Server is stopped (last known: http://${host}:${port})`);
        }
      } catch (error) {
        logger.error('Failed to get server status:', error);
        process.exit(1);
      }
    });

  return serverCommand;
};
