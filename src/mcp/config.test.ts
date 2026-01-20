import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  let stderrWriteSpy: MockInstance;

  beforeEach(() => {
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrWriteSpy.mockRestore();
  });

  describe('markdown directory loading', () => {
    it('should load all agents from example-config directory', async () => {
      const agentDir = join(process.cwd(), 'example-config', 'agents');
      const config = await loadConfig({ agentDirs: [agentDir] });

      expect(config.agents).toHaveLength(7);

      const agentNames = config.agents.map((a) => a.name).sort();
      expect(agentNames).toEqual([
        'architect',
        'engineer',
        'qa',
        'researcher',
        'reviewer',
        'translator',
        'writer',
      ]);
    });

    it('should correctly load architect agent', async () => {
      const agentDir = join(process.cwd(), 'example-config', 'agents');
      const config = await loadConfig({ agentDirs: [agentDir] });

      const architect = config.agents.find((a) => a.name === 'architect');
      expect(architect).toBeDefined();
      expect(architect?.description).toBe(
        'Design implementation approach for complex tasks, compare options, and define architecture',
      );
      expect(architect?.agents).toEqual([{ sdkType: 'codex' }]);
      expect(architect?.prompt).toContain('Design implementation approach');
      expect(architect?.prompt).toContain('<role>');
    });

    it('should correctly load engineer agent', async () => {
      const agentDir = join(process.cwd(), 'example-config', 'agents');
      const config = await loadConfig({ agentDirs: [agentDir] });

      const engineer = config.agents.find((a) => a.name === 'engineer');
      expect(engineer).toBeDefined();
      expect(engineer?.description).toContain('strict type safety');
      expect(engineer?.agents).toEqual([{ sdkType: 'claude' }]);
      expect(engineer?.prompt).toContain('type safety');
    });

    it('should correctly load researcher agent with model', async () => {
      const agentDir = join(process.cwd(), 'example-config', 'agents');
      const config = await loadConfig({ agentDirs: [agentDir] });

      const researcher = config.agents.find((a) => a.name === 'researcher');
      expect(researcher).toBeDefined();
      expect(researcher?.agents).toEqual([{ sdkType: 'gemini', model: 'gemini-2.0-flash-exp' }]);
    });

    it('should load from multiple directories', async () => {
      const tempDir1 = join(process.cwd(), '__temp_test_1__');
      const tempDir2 = join(process.cwd(), '__temp_test_2__');
      mkdirSync(tempDir1, { recursive: true });
      mkdirSync(tempDir2, { recursive: true });

      try {
        writeFileSync(
          join(tempDir1, 'agent1.md'),
          `---
name: agent1
description: Agent 1
agents:
  - sdkType: claude
---
Prompt 1`,
        );
        writeFileSync(
          join(tempDir2, 'agent2.md'),
          `---
name: agent2
description: Agent 2
agents:
  - sdkType: codex
---
Prompt 2`,
        );

        const config = await loadConfig({ agentDirs: [tempDir1, tempDir2] });
        expect(config.agents).toHaveLength(2);
        expect(config.agents.map((a) => a.name).sort()).toEqual(['agent1', 'agent2']);
      } finally {
        rmSync(tempDir1, { recursive: true, force: true });
        rmSync(tempDir2, { recursive: true, force: true });
      }
    });

    it('should ignore non-markdown files', async () => {
      const tempDir = join(process.cwd(), '__temp_test__');
      mkdirSync(tempDir, { recursive: true });

      try {
        writeFileSync(
          join(tempDir, 'agent.md'),
          `---
name: valid
description: Valid agent
agents:
  - sdkType: claude
---
Prompt`,
        );
        writeFileSync(join(tempDir, 'readme.txt'), 'Not a markdown file');
        writeFileSync(join(tempDir, 'config.json'), '{}');

        const config = await loadConfig({ agentDirs: [tempDir] });
        expect(config.agents).toHaveLength(1);
        expect(config.agents[0]?.name).toBe('valid');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should handle empty prompt', async () => {
      const tempDir = join(process.cwd(), '__temp_test__');
      mkdirSync(tempDir, { recursive: true });

      try {
        writeFileSync(
          join(tempDir, 'no-prompt.md'),
          `---
name: no-prompt
description: Agent without prompt
agents:
  - sdkType: claude
---`,
        );

        const config = await loadConfig({ agentDirs: [tempDir] });
        expect(config.agents).toHaveLength(0);
        expect(stderrWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Warning] Skipping invalid agent file'),
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should return empty agents when directory does not exist', async () => {
      const config = await loadConfig({ agentDirs: ['/non/existent/path'] });
      expect(config.agents).toHaveLength(0);
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Warning] Agent directory not found'),
      );
    });

    it('should return empty agents when no directories provided', async () => {
      const config = await loadConfig({ agentDirs: [] });
      expect(config.agents).toHaveLength(0);
    });
  });

  describe('config file loading', () => {
    it('should load without config file', async () => {
      const agentDir = join(process.cwd(), 'example-config', 'agents');
      const config = await loadConfig({ agentDirs: [agentDir] });
      expect(config.agents).toHaveLength(7);
    });

    it('should load with empty config file', async () => {
      const tempDir = join(process.cwd(), '__temp_test__');
      mkdirSync(tempDir, { recursive: true });

      try {
        const configPath = join(tempDir, 'config.json');
        writeFileSync(configPath, JSON.stringify({}));

        writeFileSync(
          join(tempDir, 'agent.md'),
          `---
name: test
description: Test agent
agents:
  - sdkType: claude
---
Prompt`,
        );

        const config = await loadConfig({ configPath, agentDirs: [tempDir] });
        expect(config.agents).toHaveLength(1);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should handle non-existent config file gracefully', async () => {
      const agentDir = join(process.cwd(), 'example-config', 'agents');
      const config = await loadConfig({
        configPath: '/non/existent/config.json',
        agentDirs: [agentDir],
      });
      expect(config.agents).toHaveLength(7);
    });

    it('should warn on invalid config file and continue', async () => {
      const tempDir = join(process.cwd(), '__temp_test__');
      mkdirSync(tempDir, { recursive: true });

      try {
        const configPath = join(tempDir, 'config.json');
        writeFileSync(configPath, 'invalid json');

        writeFileSync(
          join(tempDir, 'agent.md'),
          `---
name: test
description: Test agent
agents:
  - sdkType: claude
---
Prompt`,
        );

        const config = await loadConfig({ configPath, agentDirs: [tempDir] });
        expect(config.agents).toHaveLength(1);
        expect(stderrWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Warning] Invalid config file'),
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('error handling', () => {
    it('should skip invalid agent files with warning', async () => {
      const tempDir = join(process.cwd(), '__temp_test__');
      mkdirSync(tempDir, { recursive: true });

      try {
        writeFileSync(
          join(tempDir, 'valid.md'),
          `---
name: valid
description: Valid agent
agents:
  - sdkType: claude
---
Prompt`,
        );
        writeFileSync(
          join(tempDir, 'invalid.md'),
          `---
description: Missing name field
agents:
  - sdkType: claude
---
Prompt`,
        );

        const config = await loadConfig({ agentDirs: [tempDir] });
        expect(config.agents).toHaveLength(1);
        expect(config.agents[0]?.name).toBe('valid');
        expect(stderrWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Warning] Skipping invalid agent file'),
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should skip agent with invalid sdkType', async () => {
      const tempDir = join(process.cwd(), '__temp_test__');
      mkdirSync(tempDir, { recursive: true });

      try {
        writeFileSync(
          join(tempDir, 'valid.md'),
          `---
name: valid
description: Valid agent
agents:
  - sdkType: claude
---
Prompt`,
        );
        writeFileSync(
          join(tempDir, 'invalid-sdk.md'),
          `---
name: invalid-sdk
description: Invalid SDK type
agents:
  - sdkType: invalid-type
---
Prompt`,
        );

        const config = await loadConfig({ agentDirs: [tempDir] });
        expect(config.agents).toHaveLength(1);
        expect(config.agents[0]?.name).toBe('valid');
        expect(stderrWriteSpy).toHaveBeenCalled();
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
