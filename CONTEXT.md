# mojibun

A Bunpro-like app for learning Japanese from JLPT N5 to N1: Kanji, Words, Grammar Points and Listening, studied through spaced Reviews of example Sentences.

## Language

### Content

**Content Graph**:
The stable set of facts about Japanese that mojibun teaches from: Study Items, Sentences, Reading Passages and the typed links between them. It says nothing about order.
_Avoid_: Curriculum, database, corpus

**Learning Path**:
The swappable rules that decide in what order Study Items are offered to a Learner, and whether any are locked.
_Avoid_: Curriculum, deck order, syllabus

**Study Item**:
Anything a Learner reviews and gains Mastery of: a Kanji, Word, Grammar Point or Listening Clip.
_Avoid_: Card, item, reviewable, note

**Kanji**:
A single Chinese character, as a Study Item.
_Avoid_: Character, glyph

**Word**:
One dictionary entry, as a Study Item. Its written forms, readings and senses all belong to the one Word.
_Avoid_: Vocab, vocabulary item, term

**Grammar Point**:
One named grammatical pattern, such as 〜てしまう, as a Study Item.
_Avoid_: Grammar rule, construction

**Listening Clip**:
Spoken audio of one Sentence, or of a short ordered run of Sentences (a dialogue), as a Study Item.
_Avoid_: Audio, recording, dialogue

**Sentence**:
A single Japanese sentence with its translation. It is not a Study Item; it is how Study Items get reviewed and practised.
_Avoid_: Example, phrase

**Example**:
A Sentence chosen to review one particular Study Item, with the part to blank out marked. Most Sentences that merely use a Word are not Examples of it.
_Avoid_: Question, prompt, card, example sentence

**Reading Passage**:
A longer Japanese text for practice. It is not a Study Item; reading it feeds the Mastery of the Words and Grammar Points it contains.
_Avoid_: Article, story, text

**JLPT Level**:
The JLPT level (N5 to N1) a Study Item is judged to belong to. Every level is an estimate, because the JLPT publishes no official lists.
_Avoid_: Grade, difficulty

### Trust and origin

**Provenance**:
Where a piece of content came from (which dataset and version, or that it was generated, and how) and under what licence. It is recorded internally for every record and our own corrections.
_Avoid_: Source, origin, credit

**Content Approval**:
The decision that a piece of content is fit to show Learners. Content is a draft until approved; only approved content reaches Learners.
_Avoid_: Moderation, review (Review means something else)

**Retired**:
Content withdrawn from Learners and the Learning Path but kept, so past Reviews still make sense. Content is retired, never deleted.
_Avoid_: Deleted, archived, removed

### Learning

**Learner**:
A person with an account who studies in mojibun.
_Avoid_: User, student

**Review**:
One attempt by a Learner to recall a Study Item, recorded permanently.
_Avoid_: Quiz, card, test

**Mastery**:
How well a Learner currently knows a Study Item, derived from their Reviews. It is always one of New, Learning, Young, Mature or Relearning.
_Avoid_: Level, tier, stage, progress, strength

**New**:
The Mastery of a Study Item the Learner has not yet met in Learn.
_Avoid_: Unseen, locked

**Learning**:
The Mastery of a Study Item the Learner has met in Learn but has not yet passed a scheduled Review of.
_Avoid_: Apprentice, beginner

**Young**:
The Mastery of a Known Study Item that the Learner is not yet expected to remember for three weeks.
_Avoid_: Familiar, adept

**Mature**:
The Mastery of a Known Study Item the Learner is expected to remember for three weeks or more. It is the highest Mastery; nothing is ever finished or retired from Reviews.
_Avoid_: Mastered, burned, done

**Relearning**:
The Mastery of a Known Study Item right after a Lapse, until it is passed again.
_Avoid_: Failed, reset

**Lapse**:
Failing a scheduled Review of a Known Study Item.
_Avoid_: Miss, mistake, demotion

**Known**:
A Study Item a Learner has passed a scheduled Review of at least once, or has claimed to know. Once Known, always Known; a claim still gets checked by a later Review.
_Avoid_: Mastered, learned

### Studying

**Learn**:
A Learner's first meeting with a batch of New Study Items, ending in a quiz that must be answered fully correctly before they go into Reviews.
_Avoid_: Lesson, unlock

**Wrap-Up**:
The end of a review session, where every Study Item missed in it is asked again until answered correctly. Only the first answer in a session counts toward Mastery.
_Avoid_: Retry, redo

**Ghost**:
An extra, short-lived re-test of the exact Example a Learner missed. It never changes Mastery.
_Avoid_: Leech, extra review

**Cram**:
Practice on chosen Study Items that leaves Mastery and statistics untouched.
_Avoid_: Practice mode, self-study

**Placement**:
A check where a Learner marks the Study Items of a JLPT Level they already know, making them Known.
_Avoid_: Knowledge check, level test
