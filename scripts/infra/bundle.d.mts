type FunctionBuild = {
  install: string[];
  external: string[];
  resolve: { alias: Record<string, string> };
  moduleTypes: Record<string, "empty">;
};
export declare const functionBuild: FunctionBuild;
export declare const workerBuild: FunctionBuild;
