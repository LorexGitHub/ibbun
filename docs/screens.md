# Screens

What each screen does, and which ones are still being redesigned.

| Screen | What it does | State |
| --- | --- | --- |
| Today | How many Reviews are due, the next step, your streak and your progress from N5 to N1. | Done |
| Learn | Batches of new Study Items: a lesson, a quiz, a Batch Text to read, and Listening Clip lessons. You can also learn any item right away. | Done |
| Reviews | Your due Reviews, then due Listening Clips, a Wrap-Up of what you missed, and Ghosts from earlier sessions. You can flag an answer you think was right. | Done |
| Reading | Reading Passages, Batch Text episodes and Practice Texts. | Works. New layout in [#222](https://github.com/LorexGitHub/ibbun/pull/222) |
| Listening | Free listening practice and Practice Text dialogues. | Works. New player in [#223](https://github.com/LorexGitHub/ibbun/pull/223) |
| Cram | Extra practice on items you pick. Cram never changes your schedule. | Works. New picker in [#220](https://github.com/LorexGitHub/ibbun/pull/220) |
| Placement | Mark what you already know at a JLPT Level, so it skips your Reviews. | Works. Tile wall in [#224](https://github.com/LorexGitHub/ibbun/pull/224) |
| Library | Every Kanji, Word and Grammar Point, with their links. | Works. Mastery wall in [#221](https://github.com/LorexGitHub/ibbun/pull/221) |
| Settings | Appearance (five looks, light or dark), your account and your study preferences. | Done |
| Approval | Supervisor only: the Content Approval queue for generated content. | Done |
| Import | Supervisor only: reports on Import Runs from the open datasets. | Done |

## Content

The worker imports the open datasets on a schedule: JMdict, KANJIDIC2, KanjiVG, Tatoeba, the JLPT level lists, UniDic pitch accent, ja Wiktionary and the Grammar Point seed. It also generates content with Claude, and an LLM reviewer checks each draft before it reaches a learner. See [import-pipeline.md](import-pipeline.md) and [content-approval.md](content-approval.md).

## Scheduling

Reviews use FSRS. Items move through Anki-style stages (New, Learning, Young, Mature), so each one comes back shortly before you'd forget it. See [learning-path.md](learning-path.md).
