import { type SkillConfig } from '../config/schema';

export const composePrompt = (input: {
  agentPrompt: string | undefined;
  userInput: string;
  enabledSkills: readonly SkillConfig[];
}): string => {
  const { agentPrompt, userInput, enabledSkills } = input;

  const skillPrompt = enabledSkills
    .map((skill) => {
      return `<skill name="${skill.name}" path="${skill.path}">
${skill.prompt}
</skill>`;
    })
    .join('\n\n');

  return `${agentPrompt === undefined ? `` : `${agentPrompt}\n\n---\n\n`}${skillPrompt.length === 0 ? '' : `## Enabled Skills\n\n${skillPrompt}\n\n---\n\n`}## User Input

${userInput}`;
};
