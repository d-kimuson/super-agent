import { logger } from '../lib/logger';
import { AgentBridge } from '../sdk';

const main = async () => {
  const bridge = AgentBridge();

  const startResult = await bridge.startSession({
    sdkType: 'gemini',
    model: 'gemini-2.5-flash-lite',
    prompt: 'hi, how are you?',
    cwd: process.cwd(),
  });

  logger.info('started', startResult.session.sdkSessionId);
  logger.info('result(started)', await startResult.stopped);

  const continueResult = await bridge.continueSessionRaw({
    sdkSessionId: startResult.session.sdkSessionId,
    prompt: 'what is the weather in tokyo?',
  });

  logger.info('result(continued)', await continueResult.stopped);
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    logger.error(error);
    process.exit(1);
  });
