import { hash, verify } from "@node-rs/argon2";

// OWASP Password Storage Cheat Sheet minimum for argon2id. Each hash records
// its own parameters, so raising these leaves old hashes verifiable.
// `Algorithm` is an ambient const enum, which verbatimModuleSyntax cannot import: 2 is Argon2id.
const ARGON2ID = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string): Promise<string> => hash(password, ARGON2ID);

export const verifyPassword = ({ hash, password }: { hash: string; password: string }): Promise<boolean> =>
  verify(hash, password);
