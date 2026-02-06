import { extname, isAbsolute, resolve } from 'node:path';

const ensureYamlExtension = (value: string) => {
  const extension = extname(value).toLowerCase();
  if (extension === '.yaml' || extension === '.yml') {
    return value;
  }
  return `${value}.yaml`;
};

export const resolveWorkflowPath = ({
  name,
  workflowDir,
  cwd,
}: {
  name: string;
  workflowDir: string;
  cwd: string;
}) => {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('workflow name is empty');
  }

  if (isAbsolute(trimmed)) {
    return ensureYamlExtension(trimmed);
  }

  const base = workflowDir.length > 0 ? workflowDir : cwd;
  const combined = resolve(base, trimmed);
  return ensureYamlExtension(combined);
};
