# Tanos and Kanjium licences

Research for ticket #21. Question: what licence, and which licence version, covers Jonathan Waller's Tanos JLPT lists (vocab, kanji, grammar), and does it cover the grammar lists? Where does Kanjium's pitch-accent data come from, what does the asterisk in "Everything*" exclude, and may we redistribute or show that data commercially?

Researched 2026-11-03. tanos.co.uk did not resolve (DNS failure) on that date, so every Tanos claim below is cited to a Wayback Machine snapshot. Kanjium claims are cited to the GitHub repo, read through the GitHub API. Anything not confirmed from a primary source is marked **(unconfirmed)**. This is not legal advice.

## Summary

| Dataset | Licence & version | Covers grammar? / Upstream | Obligations | Evidence |
|---|---|---|---|---|
| **Tanos JLPT lists** (Jonathan Waller) | Creative Commons "BY". **No version is stated** and the site never links to a CC deed. | Yes. The statement covers "Everything on this site (that I'm not selling)", and the grammar lists are free downloads. The N1/N2 **grammar usage** pages are copied from Kanzen Master, which Waller cannot licence. | Credit the site; "A link would be nice". Commercial use allowed. No ShareAlike, no NonCommercial. | `/jlpt/sharing/` snapshots 2011 to 2025 |
| **Kanjium pitch accent** (`accents.txt`, `*_acc` columns) | Repo is CC BY-SA 4.0 for "Everything*". | Upstream is **not disclosed**. The maintainer says it is "from 2-3 legitimate sources", withheld "due to potential copyright issues". He also says the "Uros O." credit covers only the CSS/arrow notation. | Formally: attribution + ShareAlike. In practice the data's origin and rights are unknown. | Issues #13, #15, #24 |

## Tanos JLPT lists (Jonathan Waller)

### Licence and version

- The "Use my data!" page says: "Everything on this site (that I'm not selling), is licenced under Creative Commons "BY". Basically this means... use anything here however you like (commercial or non-commercial), but credit my site. (A link would be nice.)" The page footer reads "© Jonathan Waller Updated: October 12, 2011".
  - https://web.archive.org/web/20250124120638/https://www.tanos.co.uk/jlpt/sharing/
  - The same wording appears in every yearly snapshot checked: 2011, 2013, 2016, 2019, 2022 and 2025. First snapshot: https://web.archive.org/web/20111014034403/http://www.tanos.co.uk/jlpt/sharing/
- **The version is not stated.** The raw HTML has no link to creativecommons.org on the sharing page, the policy page, the JLPT home page, the skills pages (grammar, vocab, kanji), or the level grammar pages. The list PDFs carry only the header "JLPT Resources – http://www.tanos.co.uk/jlpt/" and no licence text. Which CC BY version applies is therefore **(unconfirmed)**. Context, not evidence: CC BY 3.0 was the current version in 2010–2011, and 4.0 was published in 2013.
- The earliest archived form of the statement is on the old "Anti-marketing policy" page, dated "Updated: November 21, 2010": https://web.archive.org/web/20110101225605/http://www.tanos.co.uk/jlpt/policy/ . The same page in March 2010 has no licence statement: https://web.archive.org/web/20100301105357/http://www.tanos.co.uk/jlpt/policy/
- The licence carves out paid products: "If you want to use something I'm selling (such as Grammar Plus audio) for non-personal use, please contact me". The vocab, kanji and grammar lists are free downloads and are not in this carve-out. https://web.archive.org/web/20250124120638/https://www.tanos.co.uk/jlpt/sharing/
- No NonCommercial or ShareAlike terms. The page says "commercial or non-commercial" explicitly.

### Attribution wording

- Waller asks only to "credit my site", and adds "(A link would be nice.)". He gives no exact credit line. Same URL as above.
- He also asks: "If you make something (paid or free) for the JLPT, let me know." This is a request, not a licence condition.

### Does it cover the grammar lists?

- Yes, as far as the site's own statement goes. The grammar lists for every level are free downloads (GrammarList.N1–N5 .doc/.pdf) on the Grammar skills page: https://web.archive.org/web/20250130134542/http://www.tanos.co.uk/jlpt/skills/grammar/
- Each level page lists the Grammar Points inline, for example N5: https://web.archive.org/web/20200117222855/http://www.tanos.co.uk/jlpt/jlpt5/grammar/
- **Exception: N1 and N2 "grammar usage" pages.** The N1 and N2 list pages say "You can also check out N1 grammar usage. (Taken from Kanzen Master.)": https://web.archive.org/web/20200124054848/http://www.tanos.co.uk/jlpt/jlpt1/grammar/ and https://web.archive.org/web/20200725191822/http://www.tanos.co.uk/jlpt/jlpt2/grammar/ . The usage page says "This list contains all the grammar from the Kanzen Master - Level 1 grammar book": https://web.archive.org/web/20251227190758/http://www.tanos.co.uk/jlpt/jlpt1/grammar/usage/ . Those explanations and example sentences come from a commercial book. Waller's CC BY statement cannot license them. Do not use the usage pages.
- Whether the N1/N2 **grammar lists** (the plain item lists, as opposed to the usage pages) were also compiled from Kanzen Master is **(unconfirmed)**. The list pages say only that the usage pages were "Taken from Kanzen Master".

### How the lists were made, and when

- The lists are estimates mapped from the pre-2010 JLPT levels. The N3 page says: "There's no official JLPT N3 vocabulary, kanji or grammar list... The new N1, N2, N4 and N5 levels are said to be at the same level as the old levels 1, 2, 3 and 4, so we can be sure of the content for N1, N4 and N5. However N2 and N3 have to be estimated." https://web.archive.org/web/20250821112922/http://www.tanos.co.uk/jlpt/jlpt3/
- On the same page, Waller says N3 vocab was built from "All the words from all the levels of the old JLPT, scaled to matched the specification of the new JLPT", sorted by Tanaka Corpus frequency where the level was unclear. Same URL.
- Where the pre-2010 level content itself came from (for example the official 出題基準 test specification), and whether that source has rights of its own, is **(unconfirmed)**. The pages we read do not say.
- The PDF lists were generated on 2010-05-20 (PDF CreationDate and ModDate metadata):
  - GrammarList.N5.pdf `D:20100520035142`: https://web.archive.org/web/20250621051542/http://www.tanos.co.uk/jlpt/jlpt5/grammar/GrammarList.N5.pdf
  - GrammarList.N1.pdf `D:20100520033037`: https://web.archive.org/web/20250809160623/http://www.tanos.co.uk/jlpt/jlpt1/grammar/GrammarList.N1.pdf
  - VocabList.N5.pdf `D:20100520035936`, KanjiList.N5.pdf `D:20100520035330` (snapshots 20240304110515 and 20251114181453 of the same paths).
- Page "Updated" footers: level grammar pages November 21, 2010; Grammar skills page December 01, 2011; Kanji skills page August 01, 2011; Vocab skills page March 11, 2017. URLs as above, plus https://web.archive.org/web/20250124121301/http://www.tanos.co.uk/jlpt/skills/vocab/ and https://web.archive.org/web/20250124125938/http://www.tanos.co.uk/jlpt/skills/kanji/ . We found no sign of updates to the lists after 2010–2011.
- The site was still being archived on 2026-01-15: https://web.archive.org/web/20260115051247/http://www.tanos.co.uk/jlpt/ . When it stopped resolving is **(unconfirmed)**.

## Kanjium pitch accent (mifunetoshiro/kanjium)

### What the licence says, and what the asterisk excludes

- README: "Everything* in this package is licensed under the Creative Commons Attribution-ShareAlike 4.0 International license." It adds: "You are free to use or modify the data however you like (for commercial or non-commercial purposes)." `LICENSE.txt` is the full CC BY-SA 4.0 legal code. https://github.com/mifunetoshiro/kanjium/blob/master/README.md , https://github.com/mifunetoshiro/kanjium/blob/master/LICENSE.txt
- The asterisk footnote lists third-party material that keeps its own terms: EDICT, KANJIDIC and KRADFILE (EDRDG, "used in conformance with the Group's license"); example sentences from Tatoeba; fonts (licence in their metadata); stroke-order images from Tim Eyre's KanjiStrokeOrders font (copyright Ulrich Apel and the Wadoku project); `/origin/` images from chineseetymology.org (copyright Richard Sears); JLPT data for words from Jonathan Waller (tanos.co.uk); hangul from libhangul (BSD 3-clause); pinyin from CC-CEDICT. Same README.
- **The footnote does not mention pitch accent.** The README asks users to credit only the maintainer's own additions, with this text: "The pitch accent notation, verb particle data, phonetics, homonyms and other additions or modifications to EDICT, KANJIDIC or KRADFILE were provided by Uros O. through his free database." Same README. The surname was shortened from "Uros Ozvatic" in commit 6a8a001 (2021-01-10): https://github.com/mifunetoshiro/kanjium/commit/6a8a001
- GitHub reports the repo licence as "Other" (`NOASSERTION`). Source: `gh api repos/mifunetoshiro/kanjium`.

### Where the pitch data came from

- `data/source_files/raw/accents.txt`: 124,137 lines of `word<TAB>reading<TAB>mora positions`. The file has no header or source note. https://github.com/mifunetoshiro/kanjium/blob/master/data/source_files/raw/accents.txt
- Commit history: the file arrived whole in "Core commit" 94473cd (2014-11-01). Since then there have been only four small fixes (2023-07-12, 2024-06-14 twice, 2024-06-16), three of them community PRs. https://github.com/mifunetoshiro/kanjium/commits/master/data/source_files/raw/accents.txt
- Issue #13 (2020) asked for the source. The maintainer replied: "It's not listed due to potential copyright issues, but it's from 2-3 legitimate sources. It is free, enjoy." https://github.com/mifunetoshiro/kanjium/issues/13#issuecomment-695782095
- Issue #15 (2021) asked whether "Uros O.'s free database" was a separate upstream. The maintainer replied: "I maybe worded it wrong, but only the CSS/arrow pitch accent notation was meant in that context. See issue #13." https://github.com/mifunetoshiro/kanjium/issues/15#issuecomment-821080980 . So the credit line covers only the rendering notation, not the accent values.
- Issue #24 (2026-10-17): a user wrote, "I think that's probably a copy of 大辞林 2nd or 3rd ed. and some NHK 1998 data." The maintainer only linked back to #15 and did not confirm or deny. https://github.com/mifunetoshiro/kanjium/issues/24 . **Lead only, not evidence.** The upstream being Daijirin and/or the NHK accent dictionary is **(unconfirmed)**.
- The README's pointer to its crowdfunding page (igg.me/at/kanjiproject) does not resolve in the Wayback Machine, so it could not be checked.
- The README does not name any upstream for the pitch data, and neither do the source-file notes (`data/source_files/0_README.txt`) or any issue. **The upstream, and its licence, cannot be identified from primary sources (unconfirmed).**

### Does the upstream allow CC BY-SA or commercial use?

- Cannot be answered, because the upstream is not disclosed. The maintainer's own words ("potential copyright issues") show that he believes the sources have rights he did not clear.
- If issue #24's guess is right, both named works are commercial dictionaries from Sanseido (大辞林) and NHK Publishing (NHK日本語発音アクセント辞典). We found no open licence for either, but we did not check publisher terms **(unconfirmed)**.
- Whether bare accent positions (word + reading + number) are protectable is a legal question we did not research. That includes copyright in the selection and EU sui generis database right. **(unconfirmed)**

## Consequences for mojibun

- **Tanos grammar lists → JLPT Level on Grammar Points: usable.** The plain level lists of Grammar Point names fall under Waller's CC BY statement. Commercial use is allowed and there is no ShareAlike. Treat the level as an estimate, especially N2/N3, which Waller says "have to be estimated". Record Provenance as "Tanos (Waller), CC BY, version unstated" on each JLPT Level assignment.
- **Do not ingest the Tanos N1/N2 "grammar usage" pages.** Their explanations and example Sentences are "Taken from Kanzen Master" and are not Waller's to license. Write Grammar Point explanations ourselves or take them from hanabira (CC BY 4.0).
- **Tanos vocab and kanji lists → JLPT Level on Words and Kanji: usable** on the same terms. Kanjium's own `jlpt` columns repeat Waller's data, per its README, so taking JLPT Levels from Kanjium adds nothing.
- **Tanos attribution:** a credits/About page line such as "JLPT level lists by Jonathan Waller, https://www.tanos.co.uk/jlpt/, licensed under Creative Commons Attribution (CC BY)". The licence version is unstated, so do not cite a specific version number or deed link as if Waller had chosen it. Optional courtesy: tell Waller, as he asks, if he can still be reached.
- **Kanjium pitch accent: do not show it commercially, and do not ship it in the Content Graph, for now.** The CC BY-SA 4.0 label is only as good as the licensor's rights. The maintainer says he left the sources unnamed because of copyright concerns. CC BY-SA 4.0 gives no warranty and does not cover third-party rights. A downstream user can be infringing even while complying with the licence.
- If we use other Kanjium data, such as phonetics, homonyms or particle data, ShareAlike applies to adapted material. Credit "Uros O." with the README's wording. The EDRDG, Tatoeba and other items in the asterisk footnote keep their own terms, which are covered in `open-japanese-datasets.md`.
- **Open questions for a lawyer or for contact:** (1) Ask Waller which CC BY version he means, and whether the N1/N2 grammar lists derive from Kanzen Master. (2) Find a pitch-accent source with a known licence before showing pitch on Words. Wadoku's accent data is a candidate to research; it was not checked here.
