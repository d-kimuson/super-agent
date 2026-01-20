export const composePrompt = (agentPrompt: string | undefined, userInput: string): string => {
  if (agentPrompt === undefined) {
    return userInput;
  }

  return `${agentPrompt}

## User Input

${userInput}`;
};
