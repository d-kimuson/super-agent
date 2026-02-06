import z from 'zod';
import { workflowBuilder } from './workflow-builder/builder/builder';

export const workflow = workflowBuilder(
  'example',
  'An example workflow',
  z.object({
    name: z.string(),
  }),
  () => ({
    name: 'John Doe',
  }),
)
  .step('prepare', {
    type: 'shell',
    command: (ctx) => {
      return ['echo', `Hello, ${ctx.input.name}!`];
    },
  })
  .step('agent', {
    type: 'agent',
    sdkType: 'claude',
    model: 'sonnet',
    prompt: (ctx) => {
      return `PrepareStdout: ${ctx.steps.prepare.status === 'success' ? ctx.steps.prepare.output.stdout : 'null'}`;
    },
  });
