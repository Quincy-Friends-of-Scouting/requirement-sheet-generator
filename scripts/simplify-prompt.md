# Condensing requirements — why the rules are what they are

The prompt itself is no longer here. `pnpm simplify:prep` composes it into
`data/to-simplify/PROMPT.md`, badge list already substituted — hand an agent
that file.

Rules 1–3 inside it come from `requirement-tree/condense`, which is also what
the paste box sends ([src/server/simplify.ts](../src/server/simplify.ts)). Only
the protocol differs: there the model returns the tree as structured output,
here it answers a numbered worksheet. They used to be two hand-synced copies
under a "change one, change both" note; a counselor should get the same rewrite
whichever path produced it, and one source is the only way to mean it.

What this file keeps is the evidence — recorded so the failures are not
rediscovered, and so nobody "tidies" the rules without knowing what each one is
holding back.

## Measured over 143 badges and 4,505 requirements

| Failure                                                    | Scale when the rule was missing       | Rule |
| ---------------------------------------------------------- | ------------------------------------- | ---- |
| Answers drifted out of step after a skipped or merged line | 10 badges; up to 19 of 45 lines wrong | 2    |
| Specifics shed to hit the character target                 | 114 lines across 62 badges            | 1, 3 |
| Cross-references cut as filler                             | 25 lines across 32 badges             | 1    |
| ALL-CAPS emphasis lowercased                               | throughout                            | 1    |

Two lessons behind the shape of the rules:

- **Ordering is priority.** Moving fidelity above the length target, and adding
  the run-long escape hatch, cut flagged lines from 114 to 55 in one pass. The
  overall shrink fell from 41% to 34% — that drop is the rules working, not a
  regression. Do not move the length target up or drop the escape hatch.
- **The count check cannot see alignment.** A model that merges one line and
  shifts the rest returns exactly the right number of lines. Only comparing
  content per position catches it, which `simplify-apply.ts` now does; rule 2
  and the tail spot-check in `PROMPT.md` are what stop it happening at all.

## Why structure is never at risk

The pipeline is built so wording is the _only_ thing a bad answer can damage:
`simplify-apply.ts` rebuilds each tree from `data/badges/`, taking labels,
nesting and requirement count from there and substituting only text. Which is
precisely why the prompt has to carry the weight on meaning.

## Examples stay invented

Every example in the rules is made up. Real requirements are Scouting America's
text and both this repo and `requirement-tree` are public, so the fixtures
exercise the same shapes — counts, cross-references, emphasis, option branches —
without copying anyone's words. Keep it that way when editing.
