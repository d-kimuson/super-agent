import type { SkillConfig } from './schema';

/**
 * Expand skills into a formatted prompt string
 */
export const expandSkills = (skills: SkillConfig[], selectedSkillNames: string[]): string => {
  const selectedSkills = skills.filter((skill) => selectedSkillNames.includes(skill.name));

  if (selectedSkills.length === 0) {
    return '';
  }

  return selectedSkills
    .map((skill) => {
      const path = skill.path ?? '<unknown>';
      return `<skill name="${skill.name}" path="${path}">
${skill.prompt}
</skill>`;
    })
    .join('\n\n');
};
