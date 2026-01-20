import { logger } from '../lib/logger';
import { AgentBridge } from '../sdk';

const main = async () => {
  const bridge = AgentBridge();

  const startResult = await bridge.startSession({
    sdkType: 'copilot',
    model: 'gpt-5-mini',
    prompt: 'hi, how are you?',
    cwd: process.cwd(),
  });

  const _continueResult = await bridge.continueSessionRaw({
    sdkSessionId: startResult.session.sdkSessionId,
    prompt: 'what is the weather in tokyo?',
  });
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    logger.error(error);
    process.exit(1);
  });
