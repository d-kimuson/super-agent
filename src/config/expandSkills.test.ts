import { describe, expect, it } from 'vitest';
import type { SkillConfig } from './schema';
import { expandSkills } from './expandSkills';

describe('expandSkills', () => {
  const mockSkills: SkillConfig[] = [
    {
      name: 'typescript',
      description: 'TypeScript best practices',
      prompt: 'Write TypeScript code with strict types',
      path: '/path/to/skills/typescript.md',
    },
    {
      name: 'testing',
      description: 'Testing best practices',
      prompt: 'Write comprehensive tests',
      path: '/path/to/skills/testing.md',
    },
  ];

  it('should return empty string when no skills are selected', () => {
    const result = expandSkills(mockSkills, []);
    expect(result).toBe('');
  });

  it('should expand single skill with proper formatting', () => {
    const result = expandSkills(mockSkills, ['typescript']);
    expect(result).toBe(
      `<skill name="typescript" path="/path/to/skills/typescript.md">
Write TypeScript code with strict types
</skill>`,
    );
  });

  it('should expand multiple skills with proper formatting', () => {
    const result = expandSkills(mockSkills, ['typescript', 'testing']);
    expect(result).toBe(
      `<skill name="typescript" path="/path/to/skills/typescript.md">
Write TypeScript code with strict types
</skill>

<skill name="testing" path="/path/to/skills/testing.md">
Write comprehensive tests
</skill>`,
    );
  });

  it('should ignore non-existent skills', () => {
    const result = expandSkills(mockSkills, ['typescript', 'non-existent']);
    expect(result).toBe(
      `<skill name="typescript" path="/path/to/skills/typescript.md">
Write TypeScript code with strict types
</skill>`,
    );
  });
});
