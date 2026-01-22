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
      const config = await loadConfig({ agentDirs: [agentDir], skillDirs: [] });

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
      const config = await loadConfig({ agentDirs: [agentDir], skillDirs: [] });

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
      const config = await loadConfig({ agentDirs: [agentDir], skillDirs: [] });

      const engineer = config.agents.find((a) => a.name === 'engineer');
      expect(engineer).toBeDefined();
      expect(engineer?.description).toContain('strict type safety');
      expect(engineer?.agents).toEqual([{ sdkType: 'claude' }]);
      expect(engineer?.prompt).toContain('type safety');
    });

    it('should correctly load researcher agent with model', async () => {
      const agentDir = join(process.cwd(), 'example-config', 'agents');
      const config = await loadConfig({ agentDirs: [agentDir], skillDirs: [] });

      const researcher = config.agents.find((a) => a.name === 'researcher');
      expect(researcher).toBeDefined();
      expect(researcher?.agents).toEqual([{ sdkType: 'gemini', model: 'gemini-2.5-flash-lite' }]);
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

        const config = await loadConfig({ agentDirs: [tempDir1, tempDir2], skillDirs: [] });
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

        const config = await loadConfig({ agentDirs: [tempDir], skillDirs: [] });
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

        const config = await loadConfig({ agentDirs: [tempDir], skillDirs: [] });
        expect(config.agents).toHaveLength(0);
        expect(stderrWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Warning] Skipping invalid Agent file'),
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should return empty agents when directory does not exist', async () => {
      const config = await loadConfig({ agentDirs: ['/non/existent/path'], skillDirs: [] });
      expect(config.agents).toHaveLength(0);
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Warning] Agent directory not found'),
      );
    });

    it('should return empty agents when no directories provided', async () => {
      const config = await loadConfig({ agentDirs: [], skillDirs: [] });
      expect(config.agents).toHaveLength(0);
    });
  });

  describe('config file loading', () => {
    it('should load without config file', async () => {
      const agentDir = join(process.cwd(), 'example-config', 'agents');
      const config = await loadConfig({ agentDirs: [agentDir], skillDirs: [] });
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

        const config = await loadConfig({ configPath, agentDirs: [tempDir], skillDirs: [] });
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
        skillDirs: [],
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

        const config = await loadConfig({ configPath, agentDirs: [tempDir], skillDirs: [] });
        expect(config.agents).toHaveLength(1);
        expect(stderrWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Warning] Invalid config file'),
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('skill directory loading', () => {
    it('should load skill from example-config/skills directory', async () => {
      const skillDir = join(process.cwd(), 'example-config', 'skills');
      const config = await loadConfig({ agentDirs: [], skillDirs: [skillDir] });

      expect(config.skills).toHaveLength(1);

      const typescript = config.skills.find((s) => s.name === 'typescript');
      expect(typescript).toBeDefined();
      expect(typescript?.description).toBe(
        'TypeScript best practices and patterns for writing type-safe code',
      );
      expect(typescript?.prompt).toContain('Type Safety');
      expect(typescript?.prompt).toContain('discriminated unions');
    });

    it('should load from multiple skill directories', async () => {
      const tempDir1 = join(process.cwd(), '__temp_skill_test_1__');
      const tempDir2 = join(process.cwd(), '__temp_skill_test_2__');
      mkdirSync(tempDir1, { recursive: true });
      mkdirSync(tempDir2, { recursive: true });

      try {
        writeFileSync(
          join(tempDir1, 'skill1.md'),
          `---
name: skill1
description: Skill 1
---
Prompt 1`,
        );
        writeFileSync(
          join(tempDir2, 'skill2.md'),
          `---
name: skill2
description: Skill 2
---
Prompt 2`,
        );

        const config = await loadConfig({ agentDirs: [], skillDirs: [tempDir1, tempDir2] });
        expect(config.skills).toHaveLength(2);
        expect(config.skills.map((s) => s.name).sort()).toEqual(['skill1', 'skill2']);
      } finally {
        rmSync(tempDir1, { recursive: true, force: true });
        rmSync(tempDir2, { recursive: true, force: true });
      }
    });

    it('should skip invalid skill files with warning', async () => {
      const tempDir = join(process.cwd(), '__temp_skill_test__');
      mkdirSync(tempDir, { recursive: true });

      try {
        writeFileSync(
          join(tempDir, 'valid.md'),
          `---
name: valid
description: Valid skill
---
Prompt`,
        );
        writeFileSync(
          join(tempDir, 'invalid.md'),
          `---
description: Missing name field
---
Prompt`,
        );

        const config = await loadConfig({ agentDirs: [], skillDirs: [tempDir] });
        expect(config.skills).toHaveLength(1);
        expect(config.skills[0]?.name).toBe('valid');
        expect(stderrWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Warning] Skipping invalid Skill file'),
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should return empty skills when directory does not exist', async () => {
      const config = await loadConfig({ agentDirs: [], skillDirs: ['/non/existent/skill/path'] });
      expect(config.skills).toHaveLength(0);
      expect(stderrWriteSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Warning] Skill directory not found'),
      );
    });

    it('should return empty skills when no skill directories provided', async () => {
      const config = await loadConfig({ agentDirs: [], skillDirs: [] });
      expect(config.skills).toHaveLength(0);
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

        const config = await loadConfig({ agentDirs: [tempDir], skillDirs: [] });
        expect(config.agents).toHaveLength(1);
        expect(config.agents[0]?.name).toBe('valid');
        expect(stderrWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Warning] Skipping invalid Agent file'),
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

        const config = await loadConfig({ agentDirs: [tempDir], skillDirs: [] });
        expect(config.agents).toHaveLength(1);
        expect(config.agents[0]?.name).toBe('valid');
        expect(stderrWriteSpy).toHaveBeenCalled();
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
