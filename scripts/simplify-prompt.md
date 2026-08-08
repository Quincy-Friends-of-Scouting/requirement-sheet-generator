# Condensing requirements — the prompt

The instructions for the condensing pass. Kept as a file, not inline in an
agent call, so runs are reproducible.

**Rules 1–3 are shared with the app's interactive path**, `src/server/simplify.ts`,
which carries the same three rules in the same order. Only the protocol differs:
here the model answers a numbered worksheet; there it returns the tree as
structured output. Change one, change both — a counselor should get the same
rewrite whether it came from a batch run or the paste box.

**Every example below is invented.** Real requirements are Scouting America's
text and this repo is public, so the fixtures here exercise the same shapes —
counts, cross-references, emphasis, option branches — without copying anyone's
words. Keep it that way when editing.

**Rules 1 and 2 come before rule 3 on purpose.** Instruction order is read as
priority. An earlier draft opened with "under 110 characters" and the model
duly shed specifics to hit it; the section order is the fix, and § Why these
rules exist records what each one is holding back. Do not "tidy" this file by
moving the length target up or dropping the escape hatch.

## Using it

Substitute the badge list into `{{SLUGS}}`, then hand an agent this whole file.
Inputs are the worksheets written by `pnpm simplify:prep`; reading material
("Resource: …" links) is already stripped out, so there is none to ignore.

---

You are condensing Scouting America merit badge requirements so each fits on a
single printed line of a counselor sign-off sheet.

Working directory: /Users/jedierikb/dev/requirement-sheet-generator

Process these badges, one at a time, in order:
{{SLUGS}}

For EACH badge:

1. Read `data/to-simplify/<slug>.txt`. A header line gives the requirement
   count, then one numbered line per requirement, indented to show nesting:

       [7]   (b) Grow six of the 15 plant varieties on the list you made in requirement 2, and record the germination time of each.

2. Write `data/simplified/<slug>.txt` — one line per input number, same order:

       [7] Grow six of the 15 varieties listed in requirement 2; record each germination time.

Do not modify anything under `data/badges/` or `data/to-simplify/`. They are
read-only inputs.

## Rule 1 — what must survive

These are official requirements a Scout is graded against. A line that loses
one of these has **changed** the requirement, not shortened it.

- **Every specific**: counts, durations, distances, measurements, scores, named
  items. `six of the 15 varieties` may not become `several varieties`. A
  spelled-out number may become a digit (`six` → `6`); it may not vanish.
- **Cross-references to other requirements, by number.** These read like filler
  and are not — they are what says _which_ thing.
  `Pick ONE of the sites you surveyed in requirement 4(a)` → `Pick ONE` is
  useless; nobody can tell which site. Abbreviate if you like:
  `Pick ONE of the sites from 4(a)`.
- **ALL-CAPS emphasis, exactly as capitalised**: ONE, TWO, THREE, ALL, EACH,
  NOT. `discuss TWO of the following` becoming `discuss two of the following`
  turns a counted choice the counselor ticks into ordinary description.
- **Official terminology and proper nouns**, as written.
- **Choice structure**: keep `Do ONE of the following` / `Do ALL of the
following` lead-ins, and write `OR` in capitals between alternatives.
- **Option names**: an `Option A—Name` line keeps its name.

Only one thing is safe to drop: a parenthetical restatement of a value in
another unit — `a 40-centimeter (16-inch) target` may become `a 40-centimeter
target`, because the target has not changed. Never drop the primary value.

## Rule 2 — one input line, one output line

This is the failure you are least likely to notice and most likely to cause.

Skipping or merging even one requirement shifts every answer after it up by
one. The file still has the right number of lines, so nothing looks wrong — but
each line then describes a **different** requirement, and the sheet prints
correct numbering against wrong text. That is worse than a bad rewrite, because
nothing downstream catches it.

Therefore:

- Never merge two requirements into one line, however closely related.
- Never skip a requirement, however slight. **A bare lead-in like `Do the
following:` still gets its own numbered line** — it is a real row on the
  sheet. Lead-ins are the most common thing to wrongly swallow into the item
  below.
- Never add a line, split one, or reorder.
- A parent keeps only its lead-in. Its detail belongs to its children, which
  are their own numbered lines — do not pull a child's content up into it.

## Rule 3 — shorten, subject to rules 1 and 2

- Aim for ONE sentence per requirement, ideally under 110 characters, so it
  fits a single printed line.
- **If you cannot fit it without breaking rule 1, let the line run long.** A
  requirement that wraps onto a second line is fine. A requirement that lost
  its count is not.
- Drop filler like `with your counselor` ONLY where it does not change what the
  Scout must do.
- If a requirement is already short, repeat it unchanged. Do not rewrite for
  the sake of it.
- Use plain ASCII punctuation.
- **Do not try to make the badge fit a page.** How many rows fit is a layout
  question, decided elsewhere; your unit of work is the single requirement.
  Compressing by merging rows breaks rule 2 and will be rejected.

## Output format

- One output line per input line. Same count, same numbers, same order.
- Each line is `[n] ` then the condensed sentence, nothing else.
- Do NOT repeat the marker (`1.`, `(a)`, `(1)`, `Option A—`). Markers are
  preserved separately — start with the prose.
- No preamble, commentary, blank lines, or markdown fences. Only the lines.

## Before you finish each badge

1. Count the lines. It must equal the header's requirement count exactly.
2. Spot-check alignment at the **start, the middle, and especially the end** —
   read input `[n]` and output `[n]` side by side and confirm they are about
   the same thing. Drift starts in the middle and is invisible at the top.
3. Re-read any line where you shortened a list or a clause, and confirm every
   count, reference and ALL-CAPS word from the input is still present.

Reply with one line per badge: slug, input count, lines written.

---

## Why these rules exist

Recorded so the failures are not rediscovered. Measured over 143 badges and
4,505 requirements.

| Failure                                                    | Scale when the rule was missing       | Rule |
| ---------------------------------------------------------- | ------------------------------------- | ---- |
| Answers drifted out of step after a skipped or merged line | 10 badges; up to 19 of 45 lines wrong | 2    |
| Specifics shed to hit the character target                 | 114 lines across 62 badges            | 1, 3 |
| Cross-references cut as filler                             | 25 lines across 32 badges             | 1    |
| ALL-CAPS emphasis lowercased                               | throughout                            | 1    |

Two lessons behind the shape of the file:

- **Ordering is priority.** Moving fidelity above the length target, and adding
  the run-long escape hatch, cut flagged lines from 114 to 55 in one pass. The
  overall shrink fell from 41% to 34% — that drop is the rules working, not a
  regression.
- **The count check cannot see alignment.** A model that merges one line and
  shifts the rest returns exactly the right number of lines. Only comparing
  content per position catches it, which `simplify-apply.ts` now does; rule 2
  and the tail spot-check are what stop it happening in the first place.

The pipeline is built so wording is the _only_ thing a bad answer can damage:
`simplify-apply.ts` rebuilds each tree from `data/badges/`, taking labels,
nesting and requirement count from there and substituting only text. Structure
is therefore never at risk — which is precisely why the prompt has to carry the
weight on meaning.
