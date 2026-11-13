# Open sign-up, bounded by token quotas

ibbun is a showcase with one supervisor, and every Learner costs LLM tokens: each Learn batch asks for a Batch Text generated for that Learner ([ADR 0008](0008-batch-texts-generated-per-learner.md)). Those tokens come out of the same daily budget that content generation and the reviewer agent use ([ADR 0010](0010-reviewer-agent-approves-supervisor-samples.md)). If that budget runs out, Content Approval stops for everyone.

Sign-up is still open to anyone. The cost is kept bounded rather than limiting who can join. Email verification is required before login, so each account costs a real inbox. Each Learner gets at most 5 Batch Texts in any rolling 24 h. Batch Texts may use at most 50% of the daily token budget, so content generation and review always keep the other half. Rate limits and a `SIGNUP_OPEN` switch let the supervisor stop abuse at once. Details are in [accounts.md](../accounts.md).

## Considered Options

- **Invite-only.** It's the cheapest and safest option, but every new Learner would wait on the supervisor, and the app couldn't be tried by someone who simply finds it.
- **Supervisor-created accounts.** The same as invite-only, with more manual work.
- **Open sign-up with only the global budget.** One busy or hostile Learner could use up the budget and stop Content Approval for everyone.
- **Captcha at sign-up.** It adds an external service. It's left for later, if rate limits and verification aren't enough.

## Consequences

- A Learner who studies a lot hits the 5-a-day limit and gets batches without a Batch Text. The story continues from the last episode, so nothing breaks.
- On a busy day, Batch Texts can run out while content generation carries on. Content Approval can't be starved by Learners.
- The quota and pool numbers are config values, so they can be tuned without a code change.
- Removing the quotas later is cheap. Closing sign-up after Learners have joined isn't, so this decision is recorded.
