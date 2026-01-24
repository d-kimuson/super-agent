import { homedir } from 'node:os';
import { resolve } from 'node:path';

const agentBridgeDir =
  process.env['SSA_DIR'] !== undefined
    ? resolve(process.env['SSA_DIR'])
    : resolve(homedir(), '.super-subagents');

export const paths = {
  agentBridgeDir,
  configFile: resolve(agentBridgeDir, 'config.json'),
  agentsDir: resolve(agentBridgeDir, 'agents'),
  skillsDir: resolve(agentBridgeDir, 'skills'),
  stateFile: resolve(agentBridgeDir, 'state.json'),
} as const;
