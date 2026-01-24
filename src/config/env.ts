import { type EnvVars, envVarsSchema } from './schema';

export const env = (() => {
  let envVars: EnvVars;

  const getEnv = <K extends keyof EnvVars>(key: K): EnvVars[K] => {
    envVars ??= envVarsSchema.parse(process.env);
    return envVars[key];
  };

  return {
    getEnv,
  };
})();
