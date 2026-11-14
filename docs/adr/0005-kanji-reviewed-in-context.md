# Kanji are reviewed in context, through Examples

Bunpro has no Kanji reviews. WaniKani and most Kanji decks review a Kanji on its own: the bare character, then its reading and meaning. #13 first planned the same for ibbun. The supervisor wants the opposite: learning Kanji in context is one of the main reasons ibbun exists. So a Kanji, like every other Study Item, is reviewed through an **Example**. The Example is a Sentence plus a target Word in it that contains the Kanji. The Word is highlighted, not blanked. The Learner types the Word's reading as it is read in that Sentence, plus the Kanji's English meaning. Both must pass, and each Review rotates to a different Example.

## Considered options

- **Bare Kanji, reading plus meaning (#13's first plan).** It needs no Sentences, so no Kanji is ever Suspended. But it trains recognition in isolation, which is what the supervisor wants to get away from. It would also need a separate prompt and grader path.
- **Blank the Kanji and ask the Learner to type it.** This needs a Japanese IME and a reading prompt, and it tests writing, not reading.
- **Ask for the Kanji's own reading inside the Word.** This needs every reading split per character (furigana alignment) and on/kun labels. The Word's reading tests the same knowledge, with data we already store.
- **Context only, no meaning facet.** Simpler, but a Learner could read a familiar Word without knowing what the Kanji means.

## Consequences

- Kanji Examples need generation (#16), queued for levelled Kanji only (about 2.1k). Until a Kanji has an approved Example, it is Suspended.
- A Kanji has no Japanese Explanation. Its Example's approval rule uses the target **Word sense's** Japanese Explanation instead ([review-answer-model.md](../review-answer-model.md#approval-rule)).
- A Kanji Review has two facets and is graded as one pass or fail (ADR 0001).
- The batch reading text ([#31](https://github.com/LorexGitHub/ibbun/issues/31)) carries the same idea from single Reviews to a whole Learn batch.
