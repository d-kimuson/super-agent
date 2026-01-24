import { type AgentModel, type Config } from '../config/schema';

type SelectModelOptions = {
  agentModels: AgentModel[];
  config: Config;
};

type SelectModelResult =
  | { code: 'success'; model: AgentModel }
  | { code: 'no-available-model'; message: string };

/**
 * Check if a model is available based on config restrictions
 */
const isModelAvailable = (model: AgentModel, config: Config): boolean => {
  // Check if provider is in availableProviders
  if (!config.availableProviders.includes(model.sdkType)) {
    return false;
  }

  // Check if model is in disabledModels
  if (model.model !== undefined && config.disabledModels.includes(model.model)) {
    return false;
  }

  // Check provider:model format in disabledModels (e.g., "claude:sonnet")
  const fullModelName = `${model.sdkType}:${model.model ?? 'default'}`;
  if (config.disabledModels.includes(fullModelName)) {
    return false;
  }

  return true;
};

/**
 * Select the best available model based on:
 * 1. Agent's defined models (filtered by availableProviders and disabledModels)
 * 2. Fallback to config.defaultModel if no agent model is available
 */
export const selectModel = ({ agentModels, config }: SelectModelOptions): SelectModelResult => {
  // Find first available model from agent's list
  const firstAvailable = agentModels.find((model) => isModelAvailable(model, config));
  if (firstAvailable !== undefined) {
    return { code: 'success', model: firstAvailable };
  }

  // Fallback to default model if configured and available
  if (config.defaultModel !== undefined && isModelAvailable(config.defaultModel, config)) {
    return { code: 'success', model: config.defaultModel };
  }

  // No available model found
  const disabledInfo =
    config.disabledModels.length > 0
      ? ` Disabled models: [${config.disabledModels.join(', ')}].`
      : '';
  const providerInfo = ` Available providers: [${config.availableProviders.join(', ')}].`;

  return {
    code: 'no-available-model',
    message: `No available model found.${providerInfo}${disabledInfo}`,
  };
};
