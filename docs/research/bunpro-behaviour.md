# Bunpro behaviour teardown

Researched 2026-10-30 from public pages only. This file records behaviour and structure, not content. "Support" means the official help centre at `bunpro.jp/support/...`. "Frontend" means the public Next.js bundle and the page JSON (`__NEXT_DATA__`) served to logged-out visitors on bunpro.jp.

## Summary

- **The SRS is a fixed ladder.** Each item has a level from 0 to 12. Levels are grouped as Beginner 0–3, Adept 1–3, Seasoned 1–3, Expert 1–2 and Master. The 11 intervals run from 4 hours up to 6 months. Master means no more reviews unless the optional "Master+" mode is on.
- **A wrong answer drops the item by 1 level by default.** A per-user "SRS Strictness" setting (1, 2, 3, Half or Full reset) can make the drop bigger, and it is set separately for grammar and vocab.
- **Ghosts are extra reviews of the exact sentence you missed.** They run on their own short schedule (4h, 12h, 24h, 48h) and never change the parent item's level.
- **Each review is one sentence.** The default question is a cloze sentence with an English hint. Every grammar point has many sentences, so you rarely see the same one twice. The hint has levels (Hide, Hint, Translation, Japanese Nuance, Nuance Translation) that you can step through during the review.
- **Answer data is per sentence.** Each sentence has a list of accepted answers, a map of alternate answers that are valid but not the target (these show a nudge and are not graded), and a map of known wrong answers that show a specific explanation. Romaji typing is converted to kana.
- **You can take back a wrong answer.** Nothing is recorded until you move on, so Undo is a real feature. Users treat it as a loophole.
- **Every session ends with a "Wrap-Up".** You must answer every missed item correctly before the session is done.
- **Content comes as decks with lessons.** The official path is N5–N1 in 10 lessons per level (50 lessons, about 12–26 points each, roughly 950 JLPT grammar points), plus Kansai and Non-JLPT extras. New items arrive through a per-deck daily goal and batch size, in a Learn → quiz → SRS flow.
- **Grammar and vocab share one engine.** Vocab adds Translate questions (Japanese word → English, fuzzy-matched) and a Knowledge Check placement.
- **Several review types exist:** Cloze (manual), Cloze flashcard, Reading, Listening, Flashcard and Translate. The type can be set per deck. Self-graded modes use Hard/Good buttons. An opt-in FSRS mode for flashcards appears in the frontend.
- **Audio differs by content.** Grammar sentences have human recordings with a male/female voice choice. Many vocab sentences use TTS, which can be hidden.
- **There is more than SRS:** Cram (practice that leaves no SRS trace), 317 graded reading passages tied to lessons, 25 free mock JLPT tests, custom decks, user-written sentences, notes, and WaniKani sync.
- **Pricing:** Free (read-only pages), Premium at $5/month, Lifetime at $150. Every new account gets a 30-day trial with no card. iOS and Android apps exist.

---

## 1. SRS

**Levels and names.** Levels run from 0 to 12. The frontend labels them Beginner 0–3 (levels 0–3), Adept 1–3 (4–6), Seasoned 1–3 (7–9), Expert 1–2 (10–11) and Master (12). It shows "Master+" when the item is in recurring-master mode (frontend chunk `87550`, function mapping streak → label, in the bundle loaded by https://bunpro.jp/grammar_points/だ). The review UI shows the level "starting from Beginner I to Master" (https://bunpro.jp/support/getting-started/review-ui-explained).

**Intervals.** There are 12 reviews in total before an item is mastered. The intervals are "4hrs, 8hrs, 24hrs, 2 days, 4 days, 8 days, 2 weeks, 1 month, 2 months, 4 months, and 6 months" (https://bunpro.jp/support/account/General-Overview, section "What is Review SRS?"; also staff member Pushindawood at https://community.bunpro.jp/t/what-are-the-srs-intervals/311). The current UI strings group them as Beginner "4, 8, 24 hours", Adept "2, 4, 8 days", Seasoned "2, 4, 8 weeks" and Expert "4, 6 months". Master is "Won't reappear in Reviews" (i18n namespace `common.srs` embedded in the grammar page JSON at https://bunpro.jp/grammar_points/だ). The newer strings say 4 and 8 weeks where the older help text says 1 and 2 months. Staff put the full ladder at "approximately one year and two months" (https://community.bunpro.jp/t/what-are-the-srs-intervals/311). The frontend multiplies intervals by per-user `srs_interval_modifier_grammar` and `srs_interval_modifier_vocab` values (default `"1.0"`), so a user-adjustable interval scale exists. **Unconfirmed:** its UI name and range.

**Wrong answers.** The frontend function `applySrsStrictness` sets the new level as follows: strictness `"1"` gives −1, `"2"` gives −2, `"3"` gives −3, `"half"` gives ceil(level/2) (0 if the level is ≤1), and `"full"` gives 0. The floor is 0. The default is `"1"` for both `srsStrictnessGrammar` and `srsStrictnessVocab` (frontend chunks `1953-…js` and `5855-…js` loaded by https://bunpro.jp/reviews). Staff announced that "SRS Strictness" was split into separate grammar and vocab controls (https://community.bunpro.jp/t/new-review-settings-aug-27th-2025/146676). Users report one drop per item per session, however many times you miss it in the session (https://community.bunpro.jp/t/is-there-a-way-to-get-bunpro-to-backgrade-your-items-every-time-you-get-something-wrong/197838). **Unconfirmed** by staff.

**Ghost reviews.** A Ghost is the specific sentence you missed. It goes into the queue "in addition to your normal reviews", on "a separate SRS", with intervals "4 hours, 12 hours, 24 hours, and 48 hrs". It disappears after Ghost level 4 and does not change the parent item's schedule. The setting has three values: "On" (a ghost after one miss), "Minimal" (a ghost only if the same sentence is missed more than once) and "Off". Ghosts can be mass-cleared under Settings > Reset (https://bunpro.jp/support/account/Review-Settings). Ghosts are only created for sentence-based review types, not flashcards (staff member Sean, https://community.bunpro.jp/t/how-to-use-ghost-reviews/216608). A "Minimum SRS For Ghosts" setting suppresses ghosts for items at low levels (https://community.bunpro.jp/t/new-review-settings-aug-27th-2025/146676). The UI also lets you create or remove a ghost by hand on a sentence ("Create Ghost Review" / "Remove Ghost", i18n `rev.examples`, grammar page JSON).

**End states.** At level 12 the item is Mastered and gets no more reviews (https://bunpro.jp/support/account/General-Overview). "Master+ Mode" is opt-in. It keeps Master items coming back at the Master interval (6 months by default), and newly converted items trickle in at 20 per day (staff, https://community.bunpro.jp/t/new-review-settings-aug-27th-2025/146676).

**Other SRS types.**
- User-created sentences use a "Self-Study" type with the same ladder: "4, 8, 24 hours, 2, 4, 8 days, 2, 4, 8 weeks, 4, 6 months" (i18n `common.srs.self-interval`).
- The frontend has an `is_fsrs` flag per review and labels it "FSRS Flashcard". FSRS reviews hide the fixed-level UI (chunk `1125-…js`). Staff said FSRS would be "an opt in setting" and would not replace the default (https://community.bunpro.jp/t/fsrs/129842). **Unconfirmed:** release state and scope.

**Cram (self-study).** Cram is free practice that "has no impact on your reviews, timetables, or user stats". It has four modes: Input, Reading, Listening and Flashcard. Self-grading uses Hard, Okay and Good, and only Hard items must be redone in Wrap-Up. Options include "Complete Mode" (every sentence of each selected item), "No Spoilers" (only sentences you have already seen) and "Only Learned". There is a "Grammar with Ghosts" filter (https://bunpro.jp/support/using-bunpro/Introduction-to-Cram, https://bunpro.jp/support/using-bunpro/Tips-&-Tricks, i18n `common.cram`).

## 2. Anatomy of a grammar point page

Sources: the rendered page and `__NEXT_DATA__` of https://bunpro.jp/grammar_points/だ, and https://bunpro.jp/support/getting-started/learning-items-through-decks.

- **Header.** Title (Japanese), furigana, a short English meaning, the JLPT level, and the position in the lesson ("N5 Lesson 1: 1/12"). Previous and next point links follow the curriculum order (`grammar_order`, `lesson_id`, `next_grammar_point`).
- **Caution banner.** A one-line warning field (`caution`) shown under the title.
- **Tabs:** Details, Examples, Resources (plus Notes for logged-in users). Keyboard shortcuts jump between them.
- **Structure.** A formation pattern with separate `casual_structure` and `polite_structure` fields. A Standard/Formal toggle switches between them, and its default is a user setting (https://bunpro.jp/support/account/General-Overview, "Standard/Formal Focus"). Parts inside the structure link out as popovers to other grammar points.
- **Details metadata:** Part of Speech, Word Type and Register (for example "Standard"). These are stored in Japanese with English translations.
- **Nuance.** A short Japanese-only definition (`nuance`) and its English version (`nuance_translation`). These feed the review hints in §3.
- **Write-up ("About").** Long-form explanation with inline "Caution" call-outs. It has English and Japanese bodies (`body`, `body_ja`). Japanese write-ups exist for N3 and N2 (https://community.bunpro.jp/t/a-year-in-review-and-2026/166237).
- **Topics.** A link to a lesson-level article with a goal, read time and the grammar points it covers.
- **Related grammar.** Three typed lists: Synonyms, Antonyms and Related. Each entry has a short comparison text (`relatedContents[].relationship_type`, `body`).
- **Vocab Coverage.** The vocab that appears in this point's sentences, with a "Knowledge Check" to place them (see §5).
- **Examples.** A sentence list with Japanese (furigana, highlighted target), English translation (highlighted target), audio, and a tense/register tag. Free users see a few. "Premium users get access to 12 example sentences". The same sentence records double as review questions (`studyQuestions`).
- **Self-Study Sentences.** Your own cloze sentences, written with four underscores for the blank, an answer, alternates, a translation and optional furigana (https://bunpro.jp/support/using-bunpro/How-to-create-your-own-sentences).
- **Resources.** "Online" links (site, title, URL) and "Offline" textbook references (book plus page or chapter). Visits are tracked and there is "Mark all as read".
- **Your Progress box (logged in).** Current SRS level, next review time, Add to Reviews, Mark as Mastered, Remove from Reviews, Reset Progress, and a level picker to set any level by hand (https://bunpro.jp/support/using-bunpro/Marking-grammar-as-'known'-&-Setting-manual-SRS-levels).
- **Custom Notes.** A rich-text personal note per point. Notes persist without a subscription (https://bunpro.jp/support/using-bunpro/Creating-custom-notes).
- **Discussion.** The latest forum replies from a linked Discourse topic.

## 3. Review session flow

**Question types** (https://bunpro.jp/support/account/Review-Settings; i18n `common.review-type`):
- "Fill In" / "Cloze (Manual)": a full sentence with the target missing, answered by typing. This is the default, paired with Manual input (https://bunpro.jp/support/getting-started/how-to-do-reviews).
- "Cloze (Flashcard)": you read the cloze sentence and grade yourself.
- "Reading": the full sentence with the answer shown. It must be paired with Reveal & Grade.
- "Listening": audio first, then self-grade. Staff announced it as an SRS review type, where before it existed only in Cram (https://community.bunpro.jp/t/new-review-settings-aug-27th-2025/146676).
- "Flashcard": the item on its own, then reveal and self-grade.
- "Translate": Japanese to English. It started as vocab-only and later gained "Translate + Reveal & Grade" for grammar (same announcement).
- "Manual Translation" ("Read in Japanese and type the translation") is in the frontend type list. **Unconfirmed:** whether it is live or marked "Coming Soon".
- Answer modes are "Manual" (always type) or "Reveal & Grade" (answer in your head, then self-grade). The review type can be overridden per deck (https://bunpro.jp/support/account/Review-Settings, https://bunpro.jp/support/getting-started/general-deck-settings).

**Input.** "You can use your English keyboard and all input will automatically be converted into hiragana" (https://bunpro.jp/support/getting-started/review-ui-explained). Each sentence stores a kana answer and a kanji answer, with matching alternate lists (`answer`, `alternate_grammar`, `kanji_answer`, `kanji_alt_grammar`). The grader builds the accepted set from these (chunk `1953-…js`).

**Hints.** The Hint button steps through states in a fixed order: Hide (Japanese only), Hint (an English gloss of just the target part), Show (the full English translation), Nuance (a Japanese-only definition of the target) and Nuance Translation. "Translation First" (the default) or "Nuance First" sets the order. "Default Level" sets the starting state. The settings apply live, even to an open review tab (https://bunpro.jp/support/account/Review-Settings; i18n `common.user.settings.hint-*`). Each sentence also has a tense/register tag (for example "Past, Polite"). Tense tags cover conjugation (negative, past, progressive, causative, passive and so on). Register tags cover formality (Standard, Polite, Casual, Kenjougo, Sonkeigo, Literary, Archaic and so on). The tags narrow which form the answer should take (https://bunpro.jp/support/using-bunpro/tense-hints-explained).

**Grading logic** (frontend submit handler, chunk `5855-…js`):
1. If the input matches a key in the sentence's `alternate_answers` map, the app shows that key's hint and does not grade. You retry. This is the "valid, but we want a different grammar point" behaviour: each alternate carries a message such as "this could work, but we're looking for the casual form", localised.
2. Cloze: correct only on an exact match against the accepted set. No fuzzy matching was found for cloze.
3. If the answer is wrong and matches a key in the `wrong_answers` map, the app shows a targeted explanation of the mistake.
4. Translate (Japanese → English): a string-similarity score of at least 0.8 against any accepted answer counts as correct. A per-vocab `wrong_answers` blacklist overrides it.
5. Self-graded modes use Hard/Good. FSRS mode uses Again/Hard/Good/Easy.

The pricing page sells this as "Extensive alternate answer list" and "Smart reviews that help you understand where you went wrong" (https://bunpro.jp/pricing).

**Undo and wrong answers.** For a wrong answer the support flow is: press "Show Answer", then the arrow to continue. "No need to correct your answer" (https://bunpro.jp/support/getting-started/how-to-do-reviews). Pricing advertises "Mistype your answer? Use the Undo button!" (https://bunpro.jp/pricing). Users note that a miss counts only when you go on to the next item. Undo before that leaves no record (https://community.bunpro.jp/t/question-regarding-the-srs-and-making-mistakes/65057; user claim, consistent with the frontend `undo` action). The "Undo Action" setting chooses between "Clear Last Character" and "Clear All Characters" (staff announcement above; i18n `common.user.settings.undo-action-*`). There is no "mark correct" override button. "Enter ×2" means "Mark as Unknown" in manual mode (https://bunpro.jp/support/using-bunpro/Utilizing-keyboard-shortcuts-to-speed-up-your-reviews).

**Session structure.** You work through the pile, then Wrap-Up: every missed item must eventually be answered correctly, however many tries it takes. The Ghost setting decides whether a Wrap-Up retry still creates a ghost. A summary screen follows (https://bunpro.jp/support/getting-started/how-to-do-reviews). "End Session" lets you skip Wrap-Up until the next session (https://bunpro.jp/support/getting-started/review-ui-explained). The header shows the SRS level (it can be hidden: "Hide Review's Level"), right/wrong counts, the remaining pile and the Wrap-Up count (same page; i18n).

**Queue controls.** In-review "Quiz Settings" has Interface and Order tabs. The queue settings cover a session limit, a category filter, and sort by ascending, descending, random, most overdue or least overdue (i18n keys `quiz:settings.queue-*`). **Unconfirmed:** what ascending and descending sort by. "Split Reviews" separates the grammar and vocab queues (https://bunpro.jp/support/account/Review-Settings). "Review Queue Timings" set to Hourly (the default) or Daily makes all of a day's reviews available at day start (same page).

**Behaviour toggles** (i18n `common.user.settings.*`):
- Lightning Mode: auto-advance on a correct answer.
- Auto-expand Info: open the item info after a correct answer.
- Autoplay Audio.
- Auto Highlight Errors: fill in the rest of a partly correct answer.
- Focus Mode.
- Colorblind Assist.
- "Display Sentence alongside Translation Questions" (staff announcement above).

**Learn vs review.** Learn shows a batch of item pages one after another, then a quiz on the batch. The quiz must be all correct to finish, and only then do the items enter the SRS (https://bunpro.jp/support/getting-started/learning-items-through-decks; https://bunpro.jp/support/account/General-Overview, "Batch Size").

## 4. Organisation

- **Lessons.** The public grammar index lists 979 points in 52 lessons. Each JLPT level has 10 lessons: N5 is lessons 1–10, N4 11–20, N3 21–30, N2 31–40 and N1 41–50. There is one Non-JLPT lesson and one Kansai-ben (関西弁) lesson. Counts: N5 132, N4 185, N3 220, N2 221, N1 187, Non-JLPT 13, Kansai 21. Lessons hold 12–26 points each (https://bunpro.jp/grammar_points, `__NEXT_DATA__`). Pricing says "900+ grammar items" (https://bunpro.jp/pricing).
- **Decks.** The Decks page has Grammar and Vocab tabs for official decks, a textbook tab, and Non-JLPT decks (dialects and others) (https://bunpro.jp/support/getting-started/brief-overview). Official JLPT decks follow Bunpro's "hand-crafted order". Users can create custom decks with Units, import Anki decks by pasting a word column, share decks publicly and bookmark them. Shared decks go through an `approval_status` and show learner counts (https://bunpro.jp/support/using-bunpro/anki-import-tutorial; https://bunpro.jp/decks/explore featured deck JSON; https://community.bunpro.jp/t/a-year-in-review-and-2026/166237).
- **Textbooks.** Textbook alignment exists as a deck tab and as page-numbered "Offline" resources on each grammar point (https://bunpro.jp/support/getting-started/brief-overview; grammar page JSON). **Unconfirmed:** which textbook decks exist, because the deck API needs login.
- **New-item intake is set per deck** (https://bunpro.jp/support/getting-started/general-deck-settings):
  - "Actively Learning" puts the deck in the Learn queue. Learn draws from all active decks at once, or from one picked from a dropdown.
  - "Daily Goal Size" is the number of new items per day from that deck.
  - "Daily Batch Size" is the number of items per Learn session. For example, a goal of 4 and a batch of 2 means two sessions.
  - "Default SRS level for new items" lets new items skip early levels.
  - "Sorting Order" sorts vocab by frequency lists (anime, novels, general, Netflix, dictionary).
  - "Review Type" sets the review type for the deck.
- **Daily goal UX.** Going past the goal is "Extra Study". The app warns "You have doubled your daily goal! Be careful to pace yourself" and suggests clearing pending reviews first (i18n `common.goals`).
- **Manual adds.** An "Add to Reviews" button on any grammar page skips the deck flow (https://bunpro.jp/support/using-bunpro/Manually-adding-grammar-and-vocab-points-to-your-review-queue). The search page supports bulk actions: add, remove, reset, set level, set review type, and mark mastered (i18n `search.bra`).

## 5. Vocabulary

- Vocab items are "Reviewables" like grammar points. A vocab page has:
  - kana and furigana, the JLPT level, and a pitch accent string (for example `LHL`);
  - five frequency ranks (anime, novels, general, Netflix, dictionary);
  - JMdict data and ID;
  - accepted English answers, a wrong-answer list, and a Japanese nuance with its translation;
  - pronunciation audio;
  - context sentences in the same cloze format as grammar.

  (https://bunpro.jp/vocabs/食べる, `__NEXT_DATA__`)
- **Review differences.** Vocab can be reviewed as cloze (type the word into a sentence) or Translate (Japanese → English, fuzzy-graded at 0.8). It can also use Reveal & Grade (https://bunpro.jp/support/account/Review-Settings; grader in §3). **Unconfirmed:** a separate reading-type prompt (word → kana) like WaniKani's. None was found.
- **Grammar ↔ vocab links.** Each grammar point lists the vocab used in its sentences ("Vocab Coverage", `coverage_vocab_ids`). Sentence text marks vocab and grammar as popovers (`vocab-popout`, `gp-popout` spans). "Knowledge Check" lets you sort covered vocab into Unknown (first review now), Familiar (Adept), Confident (Expert) or Mastered (no reviews), or "Skip for Now" (i18n `search.coverage`). Vocab decks sit in the same Learn queue, and pricing advertises "Learn Vocab together with Grammar" and "100,000+ vocabulary context sentences with gradually increasing difficulty" (https://bunpro.jp/pricing).
- **WaniKani integration.** It can hide furigana for kanji and vocab you know on WaniKani, mark WaniKani-known items as Mastered, and set Guru items to Seasoned 1 (https://bunpro.jp/support/account/General-Overview).

## 6. Reading and listening

- **Reading Passages.** 317 passages in the public list. A lesson page holds 5 passages that use "only grammar taught from those exact lessons" (https://bunpro.jp/support/using-bunpro/Reading-Practice; https://bunpro.jp/reading_passages). Each passage has:
  - a context title with translation and an illustration;
  - sentence-by-sentence Japanese and English;
  - liner "Notes" and the targeted grammar IDs;
  - full audio with per-sentence timestamps;
  - a discussion link.

  (https://bunpro.jp/reading_passages/lesson/1, `__NEXT_DATA__`). The UI has toggles for English, Notes and "Highlight Grammar". Pricing lists "120+ graded reading passages", which is out of date against the 317 listed.
- **Listening.** Listening is a Cram mode and a review type (§1, §3). Grammar pages and settings have a "Listening Mode" that hides the example text so you hear it first (https://bunpro.jp/support/account/General-Overview).
- **Audio sources.** Pricing claims "Native audio recordings on all grammar example sentences" (https://bunpro.jp/pricing). Grammar sentence records have male and female audio URLs, with `has_tts_audio: false` in the sample. The vocab sample's sentence audio sits under an `/audio/vocab/tts/` path with `has_tts_audio: true`, and the UI has "TTS audio hidden through settings". Users can choose "Preferred Voice Gender" (Male, Female or Random), speed and volume (vocab and grammar page JSON; i18n `common.audio`).
- **Mock JLPT tests.** 25 full tests, five per level, in the official sections (Vocab, Grammar & Reading, Listening), with professionally recorded audio. They are free without an account (https://bunpro.jp/jlpt_practice_tests).

## 7. Progress and stats

- **Stats page.** Total reviews, correct and incorrect counts, accuracy, reviews per day, new items per day, items per JLPT level, items per SRS streak, ghost count and Cram stats (https://bunpro.jp/support/using-bunpro/Personalized-Stat-Page). There is also a shareable "report card" profile (same page).
- **Dashboard.** A Review Forecast (hourly or daily, chosen in settings), a Streak (any review, Cram or Learn on consecutive days), "JLPT Progress" toggled between grammar, vocab and mixed, Recent Badges, and Learn and Review buttons with per-deck dropdowns (https://bunpro.jp/support/account/General-Overview; i18n `common.jlpt-prog`, `common.profile`). Pricing also lists XP and Badges (https://bunpro.jp/pricing). The streak count can be set by hand (https://bunpro.jp/support/account/Resetting-Various-Things-+-Set-Streak).
- **Per-item progress.** The current level, next review time, accuracy grid, ghost count and start date (i18n `rev.progress`).
- **Known/skip.**
  - In Learn, a button skips an item you already know so it is never tested.
  - On the item page, "Mark as Mastered" sets level 12 and is reversible.
  - "Remove from Reviews" sets level 0 and takes the item out of the queue. "Reset Progress" sets level 0 and keeps it in the queue.
  - Any level can be set by hand.

  (https://bunpro.jp/support/getting-started/learning-items-through-decks; https://bunpro.jp/support/using-bunpro/Marking-grammar-as-'known'-&-Setting-manual-SRS-levels). Bulk mastering warns that it grants a lot of XP (i18n `search.bra.mastered-confirm`).
- **Reset page.** Resets all reviews, ghosts only, or one JLPT level, and wipes their stats and XP (https://bunpro.jp/support/account/Resetting-Various-Things-+-Set-Streak).

## 8. Other notable structure

- **Vacation Mode** pauses all reviews indefinitely (https://bunpro.jp/support/account/General-Overview).
- **General settings** (same page):
  - Furigana On, Off or WaniKani, plus "Furigana On Hover";
  - Hide English on examples;
  - Standard/Formal default;
  - Start Page;
  - Show NSFW Content.
- **Keyboard shortcuts** (https://bunpro.jp/support/using-bunpro/Utilizing-keyboard-shortcuts-to-speed-up-your-reviews):
  - Reviews: Enter submits. `A` shows the answer and cycles alternates. `P` plays audio. Shift+Space shows a hint. `F` opens item info. `0` finishes or wraps up. `\` opens the hotkey guide. `1`/`2` grade Hard/Good.
  - Learn: arrows move between items, N/D/E/R jump to sections, Ctrl+Shift+A adds to reviews, Ctrl+Shift+M marks mastered.
  - Dashboard: `L` starts Learn, `R` opens the review menu, then `1` for grammar or `2` for vocab.
- **Mobile apps.** iOS and Android apps exist (https://bunpro.jp/apps). The App Store listing mentions widgets, offline JLPT tests, and in-app prices of $6.49/month, $64.99/year and $194.99 lifetime, higher than the web's $5/month and $150 lifetime (https://apps.apple.com/app/bunpro-japanese-srs/id1615337616; https://bunpro.jp/pricing). Staff list the app's full launch from beta as a 2025 item (https://community.bunpro.jp/t/a-year-in-review-and-2026/166237).
- **Monetisation.**
  - Paywall: free users get grammar and vocab pages, a few examples, resources, reading passages and mock tests. Premium adds SRS reviews, decks, all sentences, user sentences and notes (https://bunpro.jp/pricing; https://bunpro.jp/support/billing-subscription/Free-Trial). Notes stay available without a subscription.
  - Gifting, plus a donation pool with matching (https://bunpro.jp/pricing).
  - Gamification: B-Points (BP) earned per review, with more for harder modes (for example grammar cloze 10, grammar reading or listening 6, vocab translate with reveal 2). BP are spent in a cosmetic shop (https://bunpro.jp/support/using-bunpro/b-points-how-to-earn-them).
- **Other routes in the frontend build manifest:** teacher and student courses, a kana trainer, `/stories` (a reader), referrals, a beta opt-in, and site languages en/es/fr/id/ja (https://bunpro.jp/_next/static/2kL37npvfQZFX4XTMese6/_buildManifest.js).
- **Bug reports.** Every review has an in-review bug report button, and every grammar point links to a forum topic. Content QA is crowd-sourced (https://bunpro.jp/support/getting-started/review-ui-explained).

## Gaps / unconfirmed

- The UI name and range of the interval multiplier (`srs_interval_modifier_*`).
- Whether a wrong answer drops the level only once per session, whatever the number of misses. This is a user report only.
- Whether FSRS is released, and which items and review types it covers. The frontend has `is_fsrs`, and staff said it would be opt-in.
- Whether "Manual Translation" (typed J→E for sentences) is live or "Coming Soon".
- Typo tolerance in cloze. Only exact matching against the accepted set was seen. Normalisation, such as handling of small kana and long vowels, inside the helper functions was not checked.
- What the queue sort options "ascending" and "descending" sort by.
- The exact set of textbook decks (Genki, Minna no Nihongo and so on). The deck list API needs login, and only the textbook page references were seen.
- Default Daily Goal and Batch Size values for new users.
- Whether vocab has a separate reading prompt (word → kana). None was found.
- What the dashboard looks like beyond the setting and i18n descriptions. It needs login.
- Ghost creation needing a vocab level above Beginner 3. This came from a summary of a forum thread and may be the "Minimum SRS For Ghosts" default.

## Implications for mojibun (opinionated)

- **Store the SRS state per item but quiz per sentence.** Bunpro's best idea is that each review draws a fresh sentence for the same grammar point, so you can't memorise one card. Model `Item` (level, next_due) separately from `Sentence` (cloze, answers), with sentence-level ghosts.
- **Make the answer schema rich from day one.** Every sentence should have accepted answers in kana and kanji, "valid but not the target" alternates with a nudge message (not graded), and known wrong answers with an explanation. This is most of what makes grammar cloze feel fair, and it is a content cost, not an engineering one.
- **Fix Bunpro's undo loophole.** Let users undo typos (an input that differs from the accepted answer by an edit distance of 1, or an IME slip) but record the first submitted wrong answer. Or let them retry only before revealing the answer. Users keep complaining about this.
- **Design the scheduler to be pluggable at the start.** Bunpro bolted on strictness, an interval multiplier, Master+ and FSRS over time. A `Scheduler` interface (fixed ladder now, FSRS later) and a configurable lapse policy are cheap now and expensive later.
- **Keep the Learn → quiz-on-batch → SRS flow, the per-deck daily goal and the Wrap-Up.** They are simple and clearly work. Use a single global daily new-items budget unless multi-deck use proves it needs per-deck goals.
- **Use human audio for grammar and accept TTS for vocab.** Bunpro does the same and labels TTS so users can hide it. Plan audio per sentence with timestamps so reading passages can sync.
- **Ship tense/register tags as structured fields, not free text.** Then hints, filters and future conjugation drills all reuse them.
- **Skip the gamification shop for an MVP.**
- **Do build Cram (practice with no SRS effect).** It is cheap once review types exist.
