/** Builds a value the first time it is asked for, so the API process needs no Sudachi and the worker no auth secret. */
export const once = <T>(build: () => T): (() => T) => {
  let value: T | undefined;
  return () => (value ??= build());
};

/** A setting the process cannot run without. */
export const required = (env: Record<string, string | undefined>, name: string): string => {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};
