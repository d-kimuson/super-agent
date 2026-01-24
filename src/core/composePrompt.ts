import { type SkillConfig } from '../config/schema';

export const composePrompt = (input: {
  agentPrompt: string | undefined;
  userInput: string;
  enabledSkills: readonly SkillConfig[];
}): string => {
  const { agentPrompt, userInput, enabledSkills } = input;

  return `${agentPrompt === undefined ? `` : `${agentPrompt}\n\n---\n\n`}## Enabled Skills

${enabledSkills
  .map((skill) => {
    return `<skill name="${skill.name}" path="${skill.path}">
${skill.prompt}
</skill>`;
  })
  .join('\n\n')}

---

## User Input

${userInput}`;
};
