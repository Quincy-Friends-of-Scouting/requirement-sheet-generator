/**
 * Write one plain-text worksheet per badge for the condensing pass, plus the
 * prompt that drives it.
 *
 * The model never sees or returns JSON. It gets a numbered line per
 * requirement — indented so the nesting is visible, since a parent's lead-in
 * ("Do the following:") should stay short while its children carry the detail —
 * and returns the same numbers with shorter prose. `simplify-apply.ts` puts the
 * original tree back around those sentences.
 *
 * Structure therefore cannot be damaged by the rewrite: labels, nesting and the
 * requirement count all come from `data/badges/`, never from the model. The
 * worst a bad answer can do is word one line poorly, which review catches.
 *
 *   pnpm simplify:prep
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { condenseRules } from 'requirement-tree/condense'

const DATA = path.join(import.meta.dirname, '..', 'data')
const BADGE_DIR = path.join(DATA, 'badges')
const OUT_DIR = path.join(DATA, 'to-simplify')

interface Node {
  label: string
  text: string
  children: Array<Node>
}

/** Flatten in print order, numbering from 1 — the key the model answers with. */
export function flatten(
  nodes: Array<Node>,
  depth = 0,
  out: Array<{ n: number; depth: number; node: Node }> = [],
): Array<{ n: number; depth: number; node: Node }> {
  for (const node of nodes) {
    out.push({ n: out.length + 1, depth, node })
    flatten(node.children, depth + 1, out)
  }
  return out
}

/**
 * The prompt for the batch pass, with the badge list already substituted in.
 *
 * Rules 1-3 come from `requirement-tree/condense` — the same text the paste box
 * sends ([src/server/simplify.ts](../src/server/simplify.ts)), so a counselor
 * gets the same rewrite whichever path produced it. They used to be restated
 * here by hand under a "change one, change both" note, which is a promise no
 * file can keep. What is written here is only the worksheet protocol: how the
 * numbered answers come back, and the checks that catch them drifting out of
 * step. `scripts/simplify-prompt.md` records why the rules are what they are.
 */
function prompt(slugs: Array<string>) {
  return `You are condensing Scouting America merit badge requirements so each fits on a
single printed line of a counselor sign-off sheet.

Working directory: ${path.join(import.meta.dirname, '..')}

Process these badges, one at a time, in order:
${slugs.join('\n')}

For EACH badge:

1. Read \`data/to-simplify/<slug>.txt\`. A header line gives the requirement
   count, then one numbered line per requirement, indented to show nesting:

       [7]   (b) Grow six of the 15 plant varieties on the list you made in requirement 2, and record the germination time of each.

2. Write \`data/simplified/<slug>.txt\` — one line per input number, same order:

       [7] Grow six of the 15 varieties listed in requirement 2; record each germination time.

Do not modify anything under \`data/badges/\` or \`data/to-simplify/\`. They are
read-only inputs.

## The rules

${condenseRules({ maxChars: 110, unit: 'line' })}

## Output format

- One output line per input line. Same count, same numbers, same order.
- Each line is \`[n] \` then the condensed sentence, nothing else.
- Do NOT repeat the marker (\`1.\`, \`(a)\`, \`(1)\`, \`Option A—\`). Markers are
  preserved separately — start with the prose.
- No preamble, commentary, blank lines, or markdown fences. Only the lines.

## Before you finish each badge

1. Count the lines. It must equal the header's requirement count exactly.
2. Spot-check alignment at the **start, the middle, and especially the end** —
   read input \`[n]\` and output \`[n]\` side by side and confirm they are about
   the same thing. Drift starts in the middle and is invisible at the top.
3. Re-read any line where you shortened a list or a clause, and confirm every
   count, reference and ALL-CAPS word from the input is still present.

Reply with one line per badge: slug, input count, lines written.
`
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const files = (await readdir(BADGE_DIR))
    .filter((f) => f.endsWith('.json'))
    .sort()

  const slugs: Array<string> = []
  let lines = 0
  for (const file of files) {
    const badge = JSON.parse(await readFile(path.join(BADGE_DIR, file), 'utf8'))
    const rows = flatten(badge.requirements)
    slugs.push(badge.slug)
    lines += rows.length
    const body = rows
      .map(
        ({ n, depth, node }) =>
          `[${n}]${'  '.repeat(depth)} ${[node.label, node.text].filter(Boolean).join(' ')}`,
      )
      .join('\n')
    await writeFile(
      path.join(OUT_DIR, `${badge.slug}.txt`),
      `Badge: ${badge.name}\nRequirements: ${rows.length}\n\n${body}\n`,
    )
  }

  await writeFile(path.join(OUT_DIR, 'PROMPT.md'), prompt(slugs))

  const rel = path.relative(path.join(import.meta.dirname, '..'), OUT_DIR)
  console.log(
    `wrote ${files.length} worksheets (${lines} requirements) to ${rel}\n` +
      `hand ${path.join(rel, 'PROMPT.md')} to an agent to run the pass`,
  )
}

await main()
