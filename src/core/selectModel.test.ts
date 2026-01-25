import { describe, expect, it } from 'vitest';
import { type AgentModel, type Config } from '../config/schema';
import { selectModel } from './selectModel';

const createConfig = (overrides: Partial<Config> = {}): Config => ({
  ssaDir: '/tmp/ssa',
  availableProviders: ['claude', 'codex', 'copilot', 'gemini'],
  disabledModels: [],
  defaultModel: { sdkType: 'claude', model: 'default' },
  agentsDirs: [],
  skillsDirs: [],
  ...overrides,
});

describe('selectModel', () => {
  describe('when agent has models', () => {
    it('returns first available model', () => {
      const agentModels: AgentModel[] = [
        { sdkType: 'claude', model: 'sonnet' },
        { sdkType: 'codex', model: 'gpt-5.2-codex' },
      ];
      const config = createConfig();

      const result = selectModel({ agentModels, config, disabledSdkTypes: [] });

      expect(result).toEqual({ code: 'success', model: { sdkType: 'claude', model: 'sonnet' } });
    });

    it('skips models with disabled provider', () => {
      const agentModels: AgentModel[] = [
        { sdkType: 'claude', model: 'sonnet' },
        { sdkType: 'codex', model: 'gpt-5.2-codex' },
      ];
      const config = createConfig({ availableProviders: ['codex', 'copilot', 'gemini'] });

      const result = selectModel({ agentModels, config, disabledSdkTypes: [] });

      expect(result).toEqual({
        code: 'success',
        model: { sdkType: 'codex', model: 'gpt-5.2-codex' },
      });
    });

    it('skips models in disabledModels list (model name)', () => {
      const agentModels: AgentModel[] = [
        { sdkType: 'claude', model: 'sonnet' },
        { sdkType: 'claude', model: 'haiku' },
      ];
      const config = createConfig({ disabledModels: ['sonnet'] });

      const result = selectModel({ agentModels, config, disabledSdkTypes: [] });

      expect(result).toEqual({ code: 'success', model: { sdkType: 'claude', model: 'haiku' } });
    });

    it('skips models in disabledModels list (provider:model format)', () => {
      const agentModels: AgentModel[] = [
        { sdkType: 'claude', model: 'sonnet' },
        { sdkType: 'codex', model: 'sonnet' },
      ];
      const config = createConfig({ disabledModels: ['claude:sonnet'] });

      const result = selectModel({ agentModels, config, disabledSdkTypes: [] });

      expect(result).toEqual({ code: 'success', model: { sdkType: 'codex', model: 'sonnet' } });
    });

    it('skips models with disabled SDK type', () => {
      const agentModels: AgentModel[] = [
        { sdkType: 'claude', model: 'sonnet' },
        { sdkType: 'codex', model: 'gpt-5.2-codex' },
      ];
      const config = createConfig();

      const result = selectModel({ agentModels, config, disabledSdkTypes: ['claude'] });

      expect(result).toEqual({
        code: 'success',
        model: { sdkType: 'codex', model: 'gpt-5.2-codex' },
      });
    });
  });

  describe('when agent has no available models', () => {
    it('falls back to defaultModel', () => {
      const agentModels: AgentModel[] = [{ sdkType: 'claude', model: 'sonnet' }];
      const config = createConfig({
        availableProviders: ['codex'],
        defaultModel: { sdkType: 'codex', model: 'gpt-5.2-codex' },
      });

      const result = selectModel({ agentModels, config, disabledSdkTypes: [] });

      expect(result).toEqual({
        code: 'success',
        model: { sdkType: 'codex', model: 'gpt-5.2-codex' },
      });
    });

    it('falls back to defaultModel when agent has no models', () => {
      const agentModels: AgentModel[] = [];
      const config = createConfig({
        defaultModel: { sdkType: 'claude', model: 'sonnet' },
      });

      const result = selectModel({ agentModels, config, disabledSdkTypes: [] });

      expect(result).toEqual({ code: 'success', model: { sdkType: 'claude', model: 'sonnet' } });
    });

    it('returns error when defaultModel is also not available', () => {
      const agentModels: AgentModel[] = [{ sdkType: 'claude', model: 'sonnet' }];
      const config = createConfig({
        availableProviders: ['codex'],
        defaultModel: { sdkType: 'claude', model: 'haiku' },
      });

      const result = selectModel({ agentModels, config, disabledSdkTypes: [] });

      expect(result.code).toBe('no-available-model');
    });

    it('returns error when no defaultModel is configured', () => {
      const agentModels: AgentModel[] = [{ sdkType: 'claude', model: 'sonnet' }];
      const config = createConfig({
        availableProviders: ['codex'],
      });

      const result = selectModel({ agentModels, config, disabledSdkTypes: [] });

      expect(result.code).toBe('no-available-model');
    });
  });

  describe('error messages', () => {
    it('includes available providers in error message', () => {
      const agentModels: AgentModel[] = [];
      // Set defaultModel to a provider not in availableProviders to force error
      const config = createConfig({
        availableProviders: ['claude', 'codex'],
        defaultModel: { sdkType: 'gemini', model: 'flash' },
      });

      const result = selectModel({ agentModels, config, disabledSdkTypes: [] });

      expect(result.code).toBe('no-available-model');
      if (result.code === 'no-available-model') {
        expect(result.message).toContain('claude, codex');
      }
    });

    it('includes disabled models in error message', () => {
      const agentModels: AgentModel[] = [];
      // Disable the default model to force error
      const config = createConfig({
        disabledModels: ['sonnet', 'haiku', 'default'],
      });

      const result = selectModel({ agentModels, config, disabledSdkTypes: [] });

      expect(result.code).toBe('no-available-model');
      if (result.code === 'no-available-model') {
        expect(result.message).toContain('sonnet, haiku');
      }
    });
  });
});
