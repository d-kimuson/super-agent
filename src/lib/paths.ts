import { homedir } from 'node:os';
import { resolve } from 'node:path';

const agentBridgeDir =
  process.env['AGB_DIR'] !== undefined
    ? resolve(process.env['AGB_DIR'])
    : resolve(homedir(), '.agent-bridge');

export const paths = {
  agentBridgeDir,
  configFile: resolve(agentBridgeDir, 'config.json'),
  agentsDir: resolve(agentBridgeDir, 'agents'),
  skillsDir: resolve(agentBridgeDir, 'skills'),
  stateFile: resolve(agentBridgeDir, 'state.json'),
} as const;
