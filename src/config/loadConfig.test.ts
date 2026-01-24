import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './loadConfig';

describe('loadConfig', () => {
  describe('config file loading', () => {
    let tempDir: string;
    let configPath: string;

    beforeEach(() => {
      tempDir = join(process.cwd(), '__temp_config_test__');
      mkdirSync(tempDir, { recursive: true });
      configPath = join(tempDir, 'config.json');
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('should return empty config when no file provided', async () => {
      const config = await loadConfig();

      expect(config).toEqual({});
    });

    it('should load values from config file', async () => {
      writeFileSync(
        configPath,
        JSON.stringify({
          agentDirs: ['/config/agents'],
          skillDirs: ['/config/skills'],
        }),
      );

      const config = await loadConfig(configPath);

      expect(config.agentDirs).toEqual(['/config/agents']);
      expect(config.skillDirs).toEqual(['/config/skills']);
    });

    it('should handle missing config file gracefully', async () => {
      const config = await loadConfig('/non/existent/config.json');

      expect(config).toEqual({});
    });

    it('should handle invalid JSON gracefully', async () => {
      writeFileSync(configPath, 'invalid json');

      const config = await loadConfig(configPath);

      expect(config).toEqual({});
    });
  });
});
