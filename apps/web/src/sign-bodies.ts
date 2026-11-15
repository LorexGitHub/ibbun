import { withBodyHash } from "./body-hash.ts";

// Imported first in main.tsx, before any module can keep its own reference to fetch.
globalThis.fetch = withBodyHash(globalThis.fetch.bind(globalThis), location.origin);
