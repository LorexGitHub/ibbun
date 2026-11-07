# mojibun

A web app for learning Japanese across JLPT levels N5–N1, through reading, grammar, listening, and vocabulary study.

## Language

### Content

**Study Item**:
Any unit of content a Learner can study and have Mastery of: a Kanji, a Word, a Grammar Point, or a Listening Clip.
_Avoid_: Card, item, entry

**Kanji**:
A single Japanese character studied in isolation (e.g. 男), with its readings and meanings.
_Avoid_: Character, glyph

**Word**:
A vocabulary entry, written with one or more Kanji and/or kana (e.g. 男性).
_Avoid_: Vocab, term, lexeme

**Grammar Point**:
A named grammatical pattern (e.g. 〜に行く) with an explanation and a JLPT Level.
_Avoid_: Grammar rule, construct

**Sentence**:
A complete Japanese sentence with translation, used to show Words and Grammar Points in context; not itself a Study Item.
_Avoid_: Example, phrase

**Listening Clip**:
Audio of a Sentence or short dialogue, studied by dictation or comprehension.
_Avoid_: Audio, track

**Reading Passage**:
A short graded text of several Sentences at one JLPT Level; a place to practise Study Items, not a Study Item itself.
_Avoid_: Article, story, text

**JLPT Level**:
One of N5, N4, N3, N2, N1, used to grade content by difficulty.
_Avoid_: Grade, tier

**Content Graph**:
The Study Items and Sentences plus the typed links between them (a Word contains a Kanji, a Sentence uses a Word, a Sentence demonstrates a Grammar Point).
_Avoid_: Database, corpus

**Provenance**:
Where a piece of content came from (a named dataset, or generated); recorded internally, never shown to a Learner.
_Avoid_: Source, origin

**Content Approval**:
The check a generated piece of content must pass before it joins the Content Graph.
_Avoid_: Review (reserved for Learner reviews), moderation

### Learner state

**Learner**:
A person studying with the app; Known flags and Mastery belong to a Learner.
_Avoid_: User, student, account

**Known**:
A flag a Learner sets by hand on a Study Item to say they already know it, independent of any review history.
_Avoid_: Learned, mastered

**Mastery**:
How well a Learner has retained a Study Item, derived from their review history; separate from Known.
_Avoid_: Progress, level, score

**Review**:
One attempt by a Learner to recall a Study Item; the history of Reviews determines Mastery.
_Avoid_: Quiz, test, attempt

**Learning Path**:
The swappable rules that decide which Study Items a Learner is offered next and which are unlocked; by default they suggest an order, and a strict mode can gate items behind others.
_Avoid_: Curriculum, course, track
