# Self-checks (phase 1)

Status: built on `feat/self-checks`, not released. Items marked **Decision** need sign-off before a release.

## Goal

Short, published health questionnaires that point to something worth checking, without diagnosing, for users in India and in other countries. Answers stay on the phone; backup and own-server sync include them, the same as check-ins.

## Phase 1 scope

| Check | What it is | Region | Wording |
|---|---|---|---|
| WHO-5 Well-Being Index | Wellbeing over the last two weeks; due again after 14 days | Everyone | Verbatim English (WHO 2024 edition) |
| AUDIT-C | Alcohol use, questions 1-3 of the WHO AUDIT | Everyone; the drink-size note differs (India: small/large peg) | Verbatim English (WHO AUDIT manual, 2001) |
| Indian Diabetes Risk Score | Type 2 diabetes risk (age, waist, activity, parents) | Shown to everyone, labelled "made for people of Indian origin" | Translated (a risk score, not a fixed-wording questionnaire) |
| American Diabetes Association risk test | Link out (no reuse terms found, so not embedded) | Everyone ("for other populations") | Their website |
| hearWHO, WHOeyes | Link out to the free WHO apps | Everyone | Their apps |
| Talk to someone | India: Tele-MANAS 14416 (call), 112 in an emergency. Elsewhere: findahelpline.com and the local emergency number | By region | Translated |

**Region:** India when the time zone is `Asia/Kolkata`, otherwise international. The user can change it in the sheet ("Where you live"). The region sets only the helplines and the drink sizes, never which checks exist.

**Where:** Settings → Self-checks. There's no Home card or reminder in phase 1.

## Scoring (lib/selfcheck.js, tested in selfcheck.test.js)

- **WHO-5:** items score 5 ("All of the time") to 0 ("At no time"). Raw 0-25, shown ×4 as 0-100. Below 50 (raw below 13) is the WHO's suggested cut-off for poor wellbeing and further assessment. A low result shows the helplines straight away. The change since the last WHO-5 is shown as a number with no interpretation.
- **AUDIT-C:** 0-4 per question, 0-12 in all. "Never" skips questions 2-3 (scored 0). A positive screen is 4+ for men and 3+ for women (Bradley 2007). Asks woman/man, prefilled from the profile.
- **IDRS (Mohan 2005):**
  - age <35 / 35-49 / 50+ scores 0/20/30;
  - waist, women <80 / 80-89 / 90+ cm and men <90 / 90-99 / 100+ cm, scores 0/10/20;
  - activity vigorous / moderate / mild / none scores 0/10/20/30;
  - parents with diabetes none / one / both scores 0/10/20;
  - bands: under 30 low, 30-50 moderate, 60+ high.

  Waist is entered in cm or inches, and values outside 40-200 cm are refused. Age is prefilled from the profile's birth year. If Labs has an HbA1c, the result shows it ("a measured value tells you more than a risk score").

Entries store answer indices, the date, the time and (for AUDIT-C/IDRS) `sex`, never text:
`{ id, inst, d, at, a: [..], sex? }` in `S.selfchecks`. Deletes are recorded in `S.selfcheckPrefs.deleted` (single result) and `.cleared` (delete all), so sync never brings a deleted result back.

## Licences and sources

| Item | Terms found | Use here |
|---|---|---|
| WHO-5 | © WHO 2024, CC BY-NC-SA 3.0 IGO: non-commercial copying allowed with citation; no WHO logo; no implied endorsement | OpenFettle is free and non-commercial: shown verbatim, cited, no logo. **Decision:** CC-NC text inside an AGPL app. The instrument stays under its own licence (noted in the source line); a commercial fork would need WHO permission. |
| AUDIT / AUDIT-C | WHO: may be reproduced and translated, not for sale; widely described as public domain for non-commercial use | Same as WHO-5 |
| IDRS | Published method (J Assoc Physicians India 2005;53:759-63, PMID 16334618); no licence terms found | The scoring method is cited, and the wording is our own. **To verify before release:** the category table against the original paper (the PMC copy was behind a captcha; values here agree across several later studies). |
| ADA risk test | No reuse terms found | Link only |
| FINDRISC | No reuse terms found (Finnish Diabetes Association) | Not used; ask the association if an embedded international diabetes score is wanted |
| PHQ-9 / GAD-7 | Pfizer: no permission needed to reproduce, translate, display or distribute | Phase 2 |
| PSS-10, ISI, ESS, STOP-Bang | Licensed (Mapi and others) | Not used unless a licence is granted |

## Translations

WHO-5 and AUDIT-C stay in English in every language, with the note "Shown in English, the wording it was tested in." Official translations exist (the WHO AUDIT manual lists Hindi, and WHO-5 has many), but phase 1 adds one only from a verified official text. **Decision:** source the Hindi AUDIT and the official WHO-5 translations for the app's languages. All other strings are in the 11 locale files (machine-assisted, like the rest of the app, and not yet checked by native speakers).

## Not in phase 1

- PHQ-9 and GAD-7 (phase 2). They need the self-harm pathway: any answer above 0 on item 9 shows support before the score.
- Reminders, a Home card and a trend chart.
- Camera, hearing or vision tests built into OpenFettle: only the WHO apps are linked.

## Test record (2026-11-19, web demo build, 360 px)

- Unit: 11 new tests (scoring with worked examples, cut-off edges, cleaning, sync deletes). The full suite passes: 696.
- E2E (Edge, `Asia/Kolkata` and `Europe/London`): 32 checks passed, with no console errors. They covered:
  - the helpline by region, and the drink note by region;
  - WHO-5 20/100 → low, with support shown;
  - AUDIT-C woman 3 → over the cut-off, and "Never" hiding questions 2-3;
  - IDRS man 50+, 40 in waist, sedentary, one parent → 90 high;
  - a bad waist value refused;
  - results saved as indices only, kept after reload, and one deleted with its tombstone;
  - Hindi: the UI translated, and WHO-5 verbatim English with the note.
- Not yet: a real phone (the `tel:` link to 14416, links opening outside the app, TalkBack).
