/**
 * Showcase mode (ADR 0017): no Learner action spends LLM tokens, and the Supervisor pages and Credits are off.
 * Pass `process.env.SHOWCASE` on the server, `import.meta.env.VITE_SHOWCASE` in the browser.
 */
export const isShowcase = (value: string | undefined): boolean => value === "1" || value === "true";

/** What a Learner is told when showcase mode has turned a generated text off. */
export const SHOWCASE_NO_TEXTS = "Batch Texts and Practice Texts aren't available in this showcase.";

/** Slices that showcase mode neither routes nor links: Supervisor pages and Credits. */
export const SHOWCASE_OFF_SLICES: readonly string[] = ["content-generation", "content-approval", "import", "credits"];
