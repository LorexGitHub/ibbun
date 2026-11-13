# ADR 0015: Local LLM providers for content generation

- Status: Accepted
- Date: 2026-11-13

## Context

Listening Clips, Reading Passages and the Examples and explanations of Grammar Points come from the `content-generation` and `content-approval` slices. Both call an `Llm` from `platform/llm`, and its only real adapter talks to the Anthropic API with `ANTHROPIC_API_KEY`. The owner has no API key, so no content is generated locally and Listening and Reading stay empty (#191).

The machine has an AMD RX 6700 XT (12 GB) running Ollama, and the owner has a Claude subscription with Claude Code. In a test on this machine, `gemma4:12b` wrote clean N5 dialogues and, as a reviewer with a JSON schema, found all three planted errors in a dialogue (a wrong conjugation, a word far above the level, a broken pattern). `qwen3.5:9b` wrote weaker Japanese and missed one of the errors. Both kept to the schema, at about 35 tokens per second.

## Decision

Two more `Llm` adapters live in `platform/llm`, beside the Anthropic one:

- **Ollama.** It calls the local Ollama API and passes the request's schema as `format`. Locally, `gemma4:12b` is the generator.
- **Claude Code.** It runs `claude -p` headless on the owner's subscription and reads the result and token usage from its JSON output. Locally, Claude is the reviewer.

`LLM_PROVIDER` picks the adapter per role. Both new adapters are for local and development use; production keeps the Anthropic API adapter. Local models appear in `LLM_PRICES` at $0. `DAILY_TOKEN_BUDGET` still applies, as a guard against runaway loops rather than against spend. The rule from `LlmConfig` stands: the reviewer is a different and stronger model than the generator.

Grammar Points are not generated. The seed (hanabira and tanos) already has 1,115 of them across N5–N1; they are reviewed, and their Examples and explanations are generated.

## Alternatives considered

- **A small API budget.** About $30 covers N5–N4 clips and passages and the whole grammar seed, but the owner has no key and wants no spend.
- **All local, with `qwen3.5:9b` generating and `gemma4:12b` reviewing.** Free and offline, but the weaker model writes, so more drafts fail review.
- **All local, `gemma4:12b` in both roles.** Better text, but the reviewer is no longer independent of the generator, which `LlmConfig` forbids.
- **All Claude through `claude -p`.** The strongest text, but every generation uses subscription quota.
- **Open corpora only** (Tatoeba sentences and audio). No model at all, but the passages are not graded to a level the way the generator plans them.

## Consequences

- A local run needs Ollama with `gemma4:12b` pulled and a logged-in `claude` CLI. VOICEVOX still voices the clips.
- Reviewing the whole grammar seed takes about six hours unattended. A local run is a background job, not an interactive step.
- The local reviewer is weaker than the production one, so the owner checks a random sample of approved items per kind and level through `sampling` before a level counts as filled.
- Cost figures from local runs are $0 and say nothing about production spend.
