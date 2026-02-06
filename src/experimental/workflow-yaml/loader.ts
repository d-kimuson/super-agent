import { parse } from 'yaml';
import { workflowRawSchema } from './schema';
import { type WorkflowDefinition } from './types';

export const loadWorkflowFromYaml = (yamlText: string): WorkflowDefinition => {
  const data: unknown = parse(yamlText);
  return workflowRawSchema.parse(data);
};
