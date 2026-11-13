# Licensing and Attribution

Decided in [#19](https://github.com/LorexGitHub/mojibun/issues/19). Terms follow [CONTEXT.md](../CONTEXT.md). Licence facts come from the research for [#8](https://github.com/LorexGitHub/mojibun/issues/8), [#11](https://github.com/LorexGitHub/mojibun/issues/11), [#21](https://github.com/LorexGitHub/mojibun/issues/21), [#24](https://github.com/LorexGitHub/mojibun/issues/24) and [#25](https://github.com/LorexGitHub/mojibun/issues/25).

mojibun is a showcase side project with no public release planned. The obligations below only start when the app is shown to people outside the team. We still build them from the start, so a deploy never needs a content purge or a retrofit. This is not legal advice (see [Public deploy](#public-deploy)).

## Rules

1. **Treated as commercial.** mojibun never uses NonCommercial content, even though it doesn't charge (#6). Adding payments later never forces removing content.
2. **Closed licence list.** Every record's Provenance holds one licence from [Approved licences](#approved-licences). Import and Content Approval reject anything else. Adding a licence needs its own issue.
3. **Provenance is internal; Attribution is shown.** Learners see the Attribution computed from Provenance, in the [three places](#where-attribution-appears) below and nowhere else.
4. **Computed, never typed.** A record's licence and Attribution come from its own source plus every input it was made from, transitively. Nobody writes a credit by hand.
5. **ShareAlike is contagious.** If any input is ShareAlike, the record is ShareAlike. A generation run counts every text placed in its prompt as an input. Everything with no ShareAlike input is **mojibun-owned**.
6. **mojibun-owned content is all rights reserved.** We don't spend effort enforcing that (purely generated text may not be protected at all). It just keeps options open.
7. **No added restrictions.** The terms of service say dataset-derived content stays under its own licence, and that mojibun claims no exclusive rights over it. Login and ordinary rate limits stay; they control access, not reuse.
8. **Monthly EDRDG refresh.** We take the cautious reading that mojibun is a "WWW dictionary server". JMdict and KANJIDIC2 are refreshed at least monthly (the schedule is in #23).

## Approved licences

| Licence | ShareAlike | Inline credit | Used by |
|---|---|---|---|
| EDRDG Licence (CC BY-SA 4.0 + extra terms) | yes | no (footer instead) | JMdict, KANJIDIC2, KRADFILE, JmdictFurigana |
| CC BY-SA 4.0 | yes | yes, for Wiktionary: link to the entry | ja Wiktionary (Japanese Explanations, #24) |
| CC BY-SA 3.0 | yes | no | KanjiVG (© Ulrich Apel) |
| CC BY 2.0 FR | no | yes: author username, linked to the sentence | Tatoeba Sentences and `jpn_indices` |
| CC BY 4.0 | no | no | hanabira Grammar Points (link to hanabira.org required) |
| CC BY, version unstated | no | no | Jonathan Waller's Tanos lists ("credit my site", link back). Not the N1/N2 grammar-usage pages (Kanzen Master, #21) |
| BSD-3-Clause | no | no | UniDic `aType` pitch accent (#25) |
| VOICEVOX voice terms, per voice | no | yes: `VOICEVOX:<character>` | Listening Clips; only voices on the allow-list (#11) |
| CC0 | no | no | Any CC0 Tatoeba Sentences |
| mojibun-owned | no | no | Content written or generated with no ShareAlike input |

"Inline credit" belongs to the licence, so the code reads it from this table and never decides it per screen.

### Excluded

NonCommercial or unclear terms, so never imported: Tae Kim's Guide (BY-NC-SA), CC BY-NC and Tatoeba-only audio, OJAD, BCCWJ, Wadoku, Kanjium pitch data (undisclosed origin), VOICEVOX No.7 and ユーレイちゃん, and any voice that needs case-by-case approval.

## Where Attribution appears

1. **Footer on every Learner screen.** The EDRDG acknowledgement (using EDRDG's sample wording) plus a link to Credits. Almost every screen shows JMdict or KANJIDIC2 data, so one global footer is simpler than deciding screen by screen.
2. **Credits page** (public, the `credits` slice). Every source with its licence, a link, and the version and date currently live: EDRDG, KanjiVG, Tatoeba, Waller/Tanos, hanabira (with the required link), the UniDic BSD notice, Wiktionary, and every `VOICEVOX:<character>` in use.
3. **Inline, where the licence needs it** (see the table). Inline credits appear on the answer and result side of a Review, in Browse and in detail views. They **never appear on the prompt**, because a credit there distracts and gives nothing away.

## Computing licence and Attribution

A record's inputs are the records it was made from: an override's target, an Example's Sentence, the Sentences a Listening Clip voices, and the texts in a generation prompt.

- **Attribution** = the record's own credit plus the Attribution of every input. Example: a Listening Clip of a Tatoeba Sentence credits both `VOICEVOX:<character>` and the Sentence's author.
- **Licence:**
  - Imported and unchanged: the source's licence.
  - With any ShareAlike input: CC BY-SA 4.0. KanjiVG's 3.0 inputs can be adapted under 4.0.
  - Otherwise: mojibun-owned, still carrying its inputs' Attribution.
- When an input's credit changes (for example, a Tatoeba author change in a weekly refresh, #23), every dependent Attribution follows, because it is computed rather than copied.

## Monthly refresh

- The refresh schedule and circuit breaker belong to #23.
- **Staleness alarm:** if the live JMdict or KANJIDIC2 data is older than 31 days (for example, because an Import Run is held by the circuit breaker), the supervisor gets an alert in the Content Approval queue.
- The Credits page shows the live EDRDG version and date, which is the evidence that the rule is kept.

## Public deploy

No public release is planned. If mojibun is ever deployed publicly ([the AWS plan](adr/0015-serverless-on-aws-with-neon.md)), a lawyer must review this policy first. Open points for that review:

- Does a study app count as an EDRDG "WWW dictionary server"?
- Is crediting Tatoeba authors on the answer side, but not on the prompt, "reasonable to the medium"?
- Does the "BY-SA text in the prompt" test for generated content go too far, or not far enough?
