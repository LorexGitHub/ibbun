---
name: Implementation issue
about: One unit of the build plan (docs/build-plan.md). Prefer adding it to scripts/build-plan/issues.py.
labels: blocked
---

Part of the build plan ([docs/build-plan.md](../blob/main/docs/build-plan.md)). Plan key: `<key>`.

## Folder

`<one folder>`. Change nothing outside it except additive core changes ([architecture.md](../blob/main/docs/architecture.md#changing-the-core)).

## Spec

The docs are authoritative; these criteria point into them.

- [<doc>#<section>](../blob/main/docs/<doc>#<section>)

## Acceptance criteria

- [ ] <checkable behaviour, from the spec>
- [ ] All CI gates pass ([architecture.md](../blob/main/docs/architecture.md#done-for-a-slice-or-core-change)); work in ub-mode
- [ ] `verify-mojibun/features/` file added or updated with `/maintain-verification-skill`
- [ ] A separate verifier agent attached passing `verify-mojibun` evidence to the PR

## Blocked by

Blocked by #<n>
