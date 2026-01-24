import { describe, expect, it } from 'vitest';
import { type SkillConfig } from '../config/schema';
import { composePrompt } from './composePrompt';

describe('composePrompt', () => {
  describe('basic prompt composition - full text snapshots', () => {
    it('full pattern: agent prompt + skills + user input', () => {
      const skills: SkillConfig[] = [
        {
          name: 'typescript',
          description: 'TypeScript helper',
          prompt: 'Use TypeScript best practices.',
          path: '/path/to/typescript.md',
        },
        {
          name: 'react',
          description: 'React helper',
          prompt: 'Use React hooks.',
          path: '/path/to/react.md',
        },
      ];

      const result = composePrompt({
        agentPrompt: 'You are a helpful assistant.',
        userInput: 'Hello, world!',
        enabledSkills: skills,
      });

      // agentPrompt末尾: \n\n---\n\n
      // テンプレートリテラルの改行: \n
      // skillPrompt先頭から: ## Enabled Skills...
      // skillPrompt末尾: \n\n---\n\n
      // テンプレートリテラルの改行: \n
      // 最後の行から: ## User Input
      expect(result).toBe(`You are a helpful assistant.

---

## Enabled Skills

<skill name="typescript" path="/path/to/typescript.md">
Use TypeScript best practices.
</skill>

<skill name="react" path="/path/to/react.md">
Use React hooks.
</skill>

---

## User Input

Hello, world!`);
    });

    it('pattern: agent prompt + no skills + user input', () => {
      const result = composePrompt({
        agentPrompt: 'You are a helpful assistant.',
        userInput: 'Hello, world!',
        enabledSkills: [],
      });

      // agentPrompt末尾: \n\n---\n\n
      // テンプレートリテラルの改行: \n
      // skillPrompt: '' (空文字)
      // テンプレートリテラルの改行: \n
      // 3行目から: ## User Input
      expect(result).toBe(`You are a helpful assistant.

---

## User Input

Hello, world!`);
    });

    it('pattern: no agent prompt + no skills + user input', () => {
      const result = composePrompt({
        agentPrompt: undefined,
        userInput: 'Hello, world!',
        enabledSkills: [],
      });

      // 1行目: '' (空文字)
      // 2行目: '' (空文字)
      // つまりテンプレートリテラル先頭の改行2つ
      // 3行目から: ## User Input
      expect(result).toBe(`## User Input

Hello, world!`);
    });
  });

  describe('basic prompt composition', () => {
    it('composes prompt with agent prompt and user input', () => {
      const result = composePrompt({
        agentPrompt: 'You are a helpful assistant.',
        userInput: 'Hello, world!',
        enabledSkills: [],
      });

      expect(result).toContain('You are a helpful assistant.');
      expect(result).toContain('Hello, world!');
      expect(result).toContain('## User Input');
    });

    it('composes prompt without agent prompt', () => {
      const result = composePrompt({
        agentPrompt: undefined,
        userInput: 'Hello, world!',
        enabledSkills: [],
      });

      // When agentPrompt is undefined and skills are empty, prompt starts with newlines then User Input
      expect(result).toContain('## User Input');
      expect(result).toContain('Hello, world!');
      expect(result).not.toContain('## Enabled Skills');
    });
  });

  describe('skill integration', () => {
    it('includes enabled skills in prompt', () => {
      const skills: SkillConfig[] = [
        {
          name: 'typescript',
          description: 'TypeScript helper',
          prompt: 'Use TypeScript best practices.',
          path: '/path/to/typescript.md',
        },
      ];

      const result = composePrompt({
        agentPrompt: 'Agent prompt',
        userInput: 'User input',
        enabledSkills: skills,
      });

      expect(result).toContain('<skill name="typescript" path="/path/to/typescript.md">');
      expect(result).toContain('Use TypeScript best practices.');
      expect(result).toContain('</skill>');
    });

    it('includes multiple skills separated by newlines', () => {
      const skills: SkillConfig[] = [
        {
          name: 'typescript',
          description: 'TypeScript helper',
          prompt: 'Use TypeScript.',
          path: '/path/to/typescript.md',
        },
        {
          name: 'react',
          description: 'React helper',
          prompt: 'Use React.',
          path: '/path/to/react.md',
        },
      ];

      const result = composePrompt({
        agentPrompt: 'Agent prompt',
        userInput: 'User input',
        enabledSkills: skills,
      });

      expect(result).toContain('<skill name="typescript"');
      expect(result).toContain('<skill name="react"');
      expect(result).toContain('Use TypeScript.');
      expect(result).toContain('Use React.');
    });

    it('handles empty skills array', () => {
      const result = composePrompt({
        agentPrompt: 'Agent prompt',
        userInput: 'User input',
        enabledSkills: [],
      });

      expect(result).not.toContain('## Enabled Skills');
      expect(result).not.toContain('<skill');
    });
  });

  describe('prompt structure', () => {
    it('has correct section order: agent -> skills -> user', () => {
      const skills: SkillConfig[] = [
        {
          name: 'test',
          description: 'Test skill',
          prompt: 'Test prompt',
          path: '/path/to/test.md',
        },
      ];

      const result = composePrompt({
        agentPrompt: 'AGENT_SECTION',
        userInput: 'USER_SECTION',
        enabledSkills: skills,
      });

      const agentIndex = result.indexOf('AGENT_SECTION');
      const skillIndex = result.indexOf('<skill');
      const userIndex = result.indexOf('USER_SECTION');

      expect(agentIndex).toBeLessThan(skillIndex);
      expect(skillIndex).toBeLessThan(userIndex);
    });

    it('separates sections with dividers when agent prompt exists', () => {
      const result = composePrompt({
        agentPrompt: 'Agent prompt',
        userInput: 'User input',
        enabledSkills: [],
      });

      // Agent prompt should be followed by separator
      expect(result).toContain('Agent prompt\n\n---\n\n');
    });
  });

  describe('edge cases', () => {
    it('handles empty user input', () => {
      const result = composePrompt({
        agentPrompt: 'Agent prompt',
        userInput: '',
        enabledSkills: [],
      });

      expect(result).toContain('## User Input\n\n');
    });

    it('handles empty agent prompt string', () => {
      const result = composePrompt({
        agentPrompt: '',
        userInput: 'User input',
        enabledSkills: [],
      });

      // Empty string is still truthy path, should include separator but no skills section
      expect(result).toContain('\n\n---\n\n');
      expect(result).not.toContain('## Enabled Skills');
    });

    it('preserves special characters in prompts', () => {
      const result = composePrompt({
        agentPrompt: 'Use <xml> tags & "quotes"',
        userInput: 'Input with $pecial ch@rs',
        enabledSkills: [],
      });

      expect(result).toContain('<xml>');
      expect(result).toContain('&');
      expect(result).toContain('"quotes"');
      expect(result).toContain('$pecial');
    });

    it('preserves newlines in skill prompts', () => {
      const skills: SkillConfig[] = [
        {
          name: 'multiline',
          description: 'Multiline skill',
          prompt: 'Line 1\nLine 2\nLine 3',
          path: '/path/to/multiline.md',
        },
      ];

      const result = composePrompt({
        agentPrompt: 'Agent',
        userInput: 'User',
        enabledSkills: skills,
      });

      expect(result).toContain('Line 1\nLine 2\nLine 3');
    });
  });
});
