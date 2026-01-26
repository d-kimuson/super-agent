import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { loadContext } from './loadContext';

describe('loadContext', () => {
  let stderrWriteSpy: MockInstance;

  beforeEach(() => {
    stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrWriteSpy.mockRestore();
  });

  describe('priority order: ConfigFile < LocalConfig < EnvVars < CliArgs', () => {
    let tempDir: string;
    let configPath: string;
    let localConfigPath: string;

    beforeEach(() => {
      tempDir = join(process.cwd(), '__temp_context_test__');
      mkdirSync(tempDir, { recursive: true });
      configPath = join(tempDir, 'config.json');
      localConfigPath = join(tempDir, 'config.local.json');
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('should use default values when no config provided', async () => {
      // Use a non-existent directory to avoid loading user's config
      const nonExistentDir = join(process.cwd(), '__non_existent_test_dir__');
      const context = await loadContext({
        cliArgs: {
          'ssa-dir': nonExistentDir,
        },
      });

      expect(context.config.ssaDir).toBe(nonExistentDir);
      expect(context.config.availableProviders).toEqual(['claude', 'codex', 'copilot', 'gemini']);
      expect(context.config.disabledModels).toEqual([]);
      expect(context.config.agentsDirs).toEqual([]);
      expect(context.config.skillsDirs).toEqual([]);
    });

    it('should load values from config file', async () => {
      writeFileSync(
        configPath,
        JSON.stringify({
          agentDirs: ['/config/agents'],
          skillDirs: ['/config/skills'],
        }),
      );

      const context = await loadContext({ cliArgs: { 'ssa-dir': tempDir } });

      expect(context.config.agentsDirs).toEqual(['/config/agents']);
      expect(context.config.skillsDirs).toEqual(['/config/skills']);
    });

    it('should override config file with env vars', async () => {
      writeFileSync(
        configPath,
        JSON.stringify({
          agentDirs: ['/config/agents'],
          skillDirs: ['/config/skills'],
        }),
      );

      const context = await loadContext({
        cliArgs: { 'ssa-dir': tempDir },
        envVars: {
          SA_AGENT_DIRS: '/env/agents',
          SA_SKILL_DIRS: '/env/skills',
        },
      });

      expect(context.config.agentsDirs).toEqual(['/env/agents']);
      expect(context.config.skillsDirs).toEqual(['/env/skills']);
    });

    it('should apply local config between config file and env vars', async () => {
      writeFileSync(
        configPath,
        JSON.stringify({
          agentDirs: ['/config/agents'],
          skillDirs: ['/config/skills'],
        }),
      );
      writeFileSync(
        localConfigPath,
        JSON.stringify({
          agentDirs: ['/local/agents'],
          skillDirs: ['/local/skills'],
        }),
      );

      const contextFromLocal = await loadContext({
        cliArgs: { 'ssa-dir': tempDir },
      });

      expect(contextFromLocal.config.agentsDirs).toEqual(['/local/agents']);
      expect(contextFromLocal.config.skillsDirs).toEqual(['/local/skills']);

      const contextFromEnv = await loadContext({
        cliArgs: { 'ssa-dir': tempDir },
        envVars: {
          SA_AGENT_DIRS: '/env/agents',
          SA_SKILL_DIRS: '/env/skills',
        },
      });

      expect(contextFromEnv.config.agentsDirs).toEqual(['/env/agents']);
      expect(contextFromEnv.config.skillsDirs).toEqual(['/env/skills']);
    });

    it('should override env vars with cli args', async () => {
      writeFileSync(
        configPath,
        JSON.stringify({
          agentDirs: ['/config/agents'],
          skillDirs: ['/config/skills'],
        }),
      );

      const context = await loadContext({
        envVars: {
          SA_DIR: tempDir,
          SA_AGENT_DIRS: '/env/agents',
          SA_SKILL_DIRS: '/env/skills',
        },
        cliArgs: {
          'agents-dir': ['/cli/agents'],
          'skills-dir': ['/cli/skills'],
        },
      });

      expect(context.config.agentsDirs).toEqual(['/cli/agents']);
      expect(context.config.skillsDirs).toEqual(['/cli/skills']);
    });

    it('should resolve config path from ssa-dir cli arg', async () => {
      const ssaDir = tempDir;
      const autoConfigPath = join(ssaDir, 'config.json');

      writeFileSync(
        autoConfigPath,
        JSON.stringify({
          agentDirs: ['/config/agents'],
        }),
      );

      const context = await loadContext({
        cliArgs: {
          'ssa-dir': ssaDir,
        },
      });

      expect(context.config.agentsDirs).toEqual(['/config/agents']);
    });

    it('should resolve config path from SA_DIR env var', async () => {
      const ssaDir = tempDir;
      const autoConfigPath = join(ssaDir, 'config.json');

      writeFileSync(
        autoConfigPath,
        JSON.stringify({
          agentDirs: ['/config/agents'],
        }),
      );

      const context = await loadContext({
        envVars: {
          SA_DIR: ssaDir,
        },
      });

      expect(context.config.agentsDirs).toEqual(['/config/agents']);
    });
  });

  describe('markdown directory loading', () => {
    it('should load all agents from example-config directory', async () => {
      const agentDir = join(process.cwd(), 'example-config', 'agents');
      const context = await loadContext({
        cliArgs: {
          'agents-dir': [agentDir],
        },
      });

      expect(context.agents).toHaveLength(8);

      const agentNames = context.agents.map((a) => a.name).sort();
      expect(agentNames).toEqual([
        'architect',
        'engineer',
        'general',
        'qa',
        'researcher',
        'reviewer',
        'translator',
        'writer',
      ]);
    });

    it('should correctly load architect agent', async () => {
      const agentDir = join(process.cwd(), 'example-config', 'agents');
      const context = await loadContext({
        cliArgs: {
          'agents-dir': [agentDir],
        },
      });

      const architect = context.agents.find((a) => a.name === 'architect');
      expect(architect).toBeDefined();
      expect(architect?.description).toBe(
        'Design implementation approach for complex tasks, compare options, and define architecture',
      );
      expect(architect?.models).toEqual([{ sdkType: 'codex' }]);
      expect(architect?.prompt).toContain('Design implementation approach');
      expect(architect?.prompt).toContain('<role>');
    });

    it('should correctly load engineer agent', async () => {
      const agentDir = join(process.cwd(), 'example-config', 'agents');
      const context = await loadContext({
        cliArgs: {
          'agents-dir': [agentDir],
        },
      });

      const engineer = context.agents.find((a) => a.name === 'engineer');
      expect(engineer).toBeDefined();
      expect(engineer?.description).toContain('strict type safety');
      expect(engineer?.models).toEqual([{ sdkType: 'claude' }]);
      expect(engineer?.prompt).toContain('type safety');
    });

    it('should correctly load researcher agent with model', async () => {
      const agentDir = join(process.cwd(), 'example-config', 'agents');
      const context = await loadContext({
        cliArgs: {
          'agents-dir': [agentDir],
        },
      });

      const researcher = context.agents.find((a) => a.name === 'researcher');
      expect(researcher).toBeDefined();
      expect(researcher?.models).toEqual([{ sdkType: 'gemini', model: 'gemini-2.5-flash-lite' }]);
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

        const context = await loadContext({
          cliArgs: {
            'agents-dir': [tempDir1, tempDir2],
          },
        });
        expect(context.agents).toHaveLength(3);
        expect(context.agents.map((a) => a.name).sort()).toEqual(['agent1', 'agent2', 'general']);
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

        const context = await loadContext({
          cliArgs: {
            'agents-dir': [tempDir],
          },
        });
        expect(context.agents).toHaveLength(2);
        expect(context.agents.map((a) => a.name).sort()).toEqual(['general', 'valid']);
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

        const context = await loadContext({
          cliArgs: {
            'agents-dir': [tempDir],
          },
        });
        expect(context.agents).toHaveLength(1);
        expect(context.agents[0]?.name).toBe('general');
        expect(stderrWriteSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Warning] Skipping invalid Agent file'),
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should return empty agents when directory does not exist', async () => {
      const context = await loadContext({
        cliArgs: {
          'agents-dir': ['/non/existent/path'],
        },
      });
      expect(context.agents).toHaveLength(1);
      expect(context.agents[0]?.name).toBe('general');
      // No warning is expected - empty directories are allowed
    });

    it('should return empty agents when no directories provided', async () => {
      // Use a non-existent directory to avoid loading user's config
      const nonExistentDir = join(process.cwd(), '__non_existent_test_dir__');
      const context = await loadContext({
        cliArgs: {
          'ssa-dir': nonExistentDir,
        },
      });
      expect(context.agents).toHaveLength(1);
      expect(context.agents[0]?.name).toBe('general');
    });
  });

  describe('config file loading', () => {
    it('should load without config file', async () => {
      const agentDir = join(process.cwd(), 'example-config', 'agents');
      const context = await loadContext({
        cliArgs: {
          'agents-dir': [agentDir],
        },
      });
      expect(context.agents).toHaveLength(8);
    });

    it('should load with empty config file', async () => {
      const tempDir = join(process.cwd(), '__temp_test__');
      mkdirSync(tempDir, { recursive: true });

      try {
        const configFilePath = join(tempDir, 'config.json');
        writeFileSync(configFilePath, JSON.stringify({}));

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

        const context = await loadContext({
          cliArgs: {
            'ssa-dir': tempDir,
            'agents-dir': [tempDir],
          },
        });
        expect(context.agents).toHaveLength(2);
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should handle non-existent config file gracefully', async () => {
      const agentDir = join(process.cwd(), 'example-config', 'agents');
      const context = await loadContext({
        cliArgs: {
          'ssa-dir': '/non/existent',
          'agents-dir': [agentDir],
        },
      });
      expect(context.agents).toHaveLength(8);
    });

    it('should warn on invalid config file and continue', async () => {
      const tempDir = join(process.cwd(), '__temp_test__');
      mkdirSync(tempDir, { recursive: true });

      try {
        const configFilePath = join(tempDir, 'config.json');
        writeFileSync(configFilePath, 'invalid json');

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

        const context = await loadContext({
          cliArgs: {
            'ssa-dir': tempDir,
            'agents-dir': [tempDir],
          },
        });
        expect(context.agents).toHaveLength(2);
        // Warning is issued by loadConfig, which writes to stderr
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
      const context = await loadContext({
        cliArgs: {
          'skills-dir': [skillDir],
        },
      });

      expect(context.skills.length).toBeGreaterThan(0);

      const typescript = context.skills.find((s) => s.name === 'typescript');
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
        // Create skill1/SKILL.md structure
        const skill1Dir = join(tempDir1, 'skill1');
        mkdirSync(skill1Dir, { recursive: true });
        writeFileSync(
          join(skill1Dir, 'SKILL.md'),
          `---
name: skill1
description: Skill 1
path: ${skill1Dir}
---
Prompt 1`,
        );

        // Create skill2/SKILL.md structure
        const skill2Dir = join(tempDir2, 'skill2');
        mkdirSync(skill2Dir, { recursive: true });
        writeFileSync(
          join(skill2Dir, 'SKILL.md'),
          `---
name: skill2
description: Skill 2
path: ${skill2Dir}
---
Prompt 2`,
        );

        const context = await loadContext({
          cliArgs: {
            'skills-dir': [tempDir1, tempDir2],
          },
        });
        expect(context.skills).toHaveLength(2);
        expect(context.skills.map((s) => s.name).sort()).toEqual(['skill1', 'skill2']);
      } finally {
        rmSync(tempDir1, { recursive: true, force: true });
        rmSync(tempDir2, { recursive: true, force: true });
      }
    });

    it('should skip invalid skill files with warning', async () => {
      const tempDir = join(process.cwd(), '__temp_skill_test__');
      mkdirSync(tempDir, { recursive: true });

      try {
        // Create valid skill
        const validDir = join(tempDir, 'valid');
        mkdirSync(validDir, { recursive: true });
        writeFileSync(
          join(validDir, 'SKILL.md'),
          `---
name: valid
description: Valid skill
path: ${validDir}
---
Prompt`,
        );

        // Create invalid skill (missing name)
        const invalidDir = join(tempDir, 'invalid');
        mkdirSync(invalidDir, { recursive: true });
        writeFileSync(
          join(invalidDir, 'SKILL.md'),
          `---
description: Missing name field
path: ${invalidDir}
---
Prompt`,
        );

        const context = await loadContext({
          cliArgs: {
            'skills-dir': [tempDir],
          },
        });
        expect(context.skills).toHaveLength(1);
        expect(context.skills[0]?.name).toBe('valid');
        expect(stderrWriteSpy).toHaveBeenCalledWith(expect.stringContaining('[Warning]'));
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should return empty skills when directory does not exist', async () => {
      const context = await loadContext({
        cliArgs: {
          'skills-dir': ['/non/existent/skill/path'],
        },
      });
      expect(context.skills).toHaveLength(0);
      // No warning is expected - empty directories are allowed
    });

    it('should return empty skills when no skill directories provided', async () => {
      // Use a non-existent directory to avoid loading user's config
      const nonExistentDir = join(process.cwd(), '__non_existent_test_dir__');
      const context = await loadContext({
        cliArgs: {
          'ssa-dir': nonExistentDir,
        },
      });
      expect(context.skills).toHaveLength(0);
    });
  });
});
