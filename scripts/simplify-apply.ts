/**
 * Rebuild each badge's tree around the condensed sentences.
 *
 * Reads `data/simplified/<slug>.txt` — the model's "[n] shorter sentence" lines —
 * and writes `data/simplified/<slug>.json` with the ORIGINAL labels, nesting and
 * requirement count, substituting only `text`. Anything the model got wrong
 * about structure is discarded here by construction; what is checked is
 * coverage (every requirement answered exactly once) and that the rewrite did
 * not quietly drop a number, a duration or a named thing.
 *
 *   pnpm simplify:apply
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { flatten } from 'requirement-tree'
import type { RequirementInput } from 'requirement-tree'

const ROOT = path.join(import.meta.dirname, '..')
const DATA = path.join(ROOT, 'data')
const BADGE_DIR = path.join(DATA, 'badges')
const OUT_DIR = path.join(DATA, 'simplified')

/**
 * Print order, which is the order the worksheet numbered them in. Depth and
 * sibling position are what an editor needs and this script does not, so the
 * rows are unwrapped back to bare nodes.
 */
const inPrintOrder = (nodes: Array<RequirementInput>) =>
  flatten(nodes).map((row) => row.requirement)

/** Rebuild with the same shape, taking each node's new text by print order. */
function rewrite(
  nodes: Array<RequirementInput>,
  texts: Map<number, string>,
  seq = { i: 0 },
): Array<RequirementInput> {
  return nodes.map((node) => {
    seq.i += 1
    return {
      label: node.label,
      text: texts.get(seq.i) ?? node.text,
      children: rewrite(node.children, texts, seq),
    }
  })
}

/**
 * Spelled-out quantities, so that condensing "three people" to "3 people" reads
 * as kept rather than lost. "one" is deliberately absent — it is too often an
 * article ("one of the following") to treat as a quantity, and the ALL-CAPS
 * check below covers the case that matters.
 */
const NUMBER_WORDS: Record<string, string> = {
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  fifteen: '15',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  hundred: '100',
}

const asDigits = (text: string) =>
  text
    .toLowerCase()
    .replace(
      new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'g'),
      (w) => NUMBER_WORDS[w],
    )

/**
 * Specifics a Scout is graded against. A condensed line that drops one has
 * changed the requirement rather than shortened it, so these are reported
 * instead of silently accepted.
 *
 * Two separate things are checked, because they fail differently:
 *
 * - **Quantities** — compared with number words normalised to digits, so
 *   "eight species" may become "8 species" but may not soften into "several".
 * - **ALL-CAPS emphasis** — compared case-sensitively, because "discuss TWO of
 *   the following" becoming "discuss two of the following" turns a counted
 *   choice the counselor ticks into ordinary description.
 */
function lostSpecifics(before: string, after: string): Array<string> {
  const lost: Array<string> = []

  const beforeDigits = asDigits(before)
  const afterDigits = asDigits(after)
  const quantities = beforeDigits.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []
  for (const q of new Set(quantities)) {
    if (!afterDigits.includes(q)) lost.push(q)
  }

  const emphasis =
    before.match(/\b(?:ONE|TWO|THREE|FOUR|FIVE|ALL|EACH|NOT)\b/g) ?? []
  for (const e of new Set(emphasis)) {
    if (!after.includes(e)) lost.push(e)
  }

  return lost
}

/**
 * Distinctive words, for checking a condensed line is about the same thing as
 * the requirement it replaced.
 */
function keywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 5),
  )
}

/**
 * Did this line answer a different requirement?
 *
 * The count check cannot see this: a model that skips one requirement and
 * shifts every later answer up by one still returns exactly the right number
 * of lines, and the tree is then rebuilt with correct structure and wrong text
 * in every slot — the worst possible failure, because nothing downstream looks
 * broken. Requiring one distinctive word in common catches the drift: however
 * hard a line is condensed, a genuine rewrite keeps at least one of the
 * requirement's own nouns, while a shifted one shares none.
 */
function looksMisaligned(before: string, after: string): boolean {
  const want = keywords(before)
  if (want.size < 3) return false // too short to judge
  const got = keywords(after)
  for (const w of want) if (got.has(w)) return false
  return true
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const files = (await readdir(BADGE_DIR))
    .filter((f) => f.endsWith('.json'))
    .sort()

  const missing: Array<string> = []
  const problems: Array<string> = []
  let done = 0
  let shorter = 0
  let beforeChars = 0
  let afterChars = 0

  for (const file of files) {
    const badge = JSON.parse(await readFile(path.join(BADGE_DIR, file), 'utf8'))
    const answerFile = path.join(OUT_DIR, `${badge.slug}.txt`)
    if (!existsSync(answerFile)) {
      missing.push(badge.slug)
      continue
    }

    const texts = new Map<number, string>()
    for (const line of (await readFile(answerFile, 'utf8')).split(/\r?\n/)) {
      const m = /^\s*\[(\d+)\]\s*(.*)$/.exec(line)
      if (m && m[2].trim()) texts.set(Number(m[1]), m[2].trim())
    }

    const original = inPrintOrder(badge.requirements)
    const unanswered = original
      .map((_, i) => i + 1)
      .filter((n) => !texts.has(n))
    if (unanswered.length) {
      problems.push(
        `${badge.slug}: ${unanswered.length}/${original.length} requirements unanswered ` +
          `(${unanswered.slice(0, 6).join(', ')}${unanswered.length > 6 ? ', …' : ''})`,
      )
      continue
    }

    const requirements = rewrite(badge.requirements, texts)
    const rewritten = inPrintOrder(requirements)

    // Alignment first: if the answers drifted, every "dropped a number" report
    // below is a symptom of that one fault, not dozens of separate ones.
    const drifted = original.filter((node, i) =>
      looksMisaligned(node.text, rewritten[i].text),
    )
    if (drifted.length > 1) {
      const first = original.findIndex((node, i) =>
        looksMisaligned(node.text, rewritten[i].text),
      )
      problems.push(
        `${badge.slug}: answers misaligned — ${drifted.length}/${original.length} lines ` +
          `are about a different requirement, from [${first + 1}] on. Re-run this badge.`,
      )
      continue
    }

    for (const [i, node] of original.entries()) {
      const lost = lostSpecifics(node.text, rewritten[i].text)
      if (lost.length) {
        problems.push(
          `${badge.slug} [${i + 1}]: dropped ${lost.join(' ')} — "${rewritten[i].text}"`,
        )
      }
    }

    for (const [i, node] of original.entries()) {
      beforeChars += node.text.length
      afterChars += rewritten[i].text.length
      if (rewritten[i].text.length <= node.text.length) shorter += 1
    }

    await writeFile(
      path.join(OUT_DIR, `${badge.slug}.json`),
      `${JSON.stringify({ ...badge, requirements, simplified: true }, null, 2)}\n`,
    )
    done += 1
  }

  console.log(`rebuilt ${done}/${files.length} badges`)
  if (done) {
    const pct = Math.round((1 - afterChars / beforeChars) * 100)
    console.log(
      `text is ${pct}% shorter overall; ${shorter} lines no longer than before`,
    )
  }
  if (missing.length)
    console.log(
      `\nnot yet condensed (${missing.length}): ${missing.join(', ')}`,
    )
  if (problems.length) {
    const report = path.join(DATA, 'simplify-report.txt')
    await writeFile(report, `${problems.join('\n')}\n`)

    const misaligned = problems.filter((p) => p.includes('misaligned'))
    const unanswered = problems.filter((p) => p.includes('unanswered'))
    const dropped = problems.filter((p) => p.includes('dropped'))
    const affected = new Set(dropped.map((p) => p.split(' ')[0]))

    console.log(
      `\n${problems.length} problem(s) — full list in ${path.relative(ROOT, report)}`,
    )
    if (misaligned.length) {
      console.log(
        `\n  ${misaligned.length} badge(s) whose answers drifted out of step — re-run these:`,
      )
      for (const p of misaligned) console.log(`    - ${p}`)
    }
    if (unanswered.length) {
      console.log(
        `\n  ${unanswered.length} badge(s) incomplete — re-run these:`,
      )
      for (const p of unanswered) console.log(`    - ${p}`)
    }
    if (dropped.length) {
      console.log(
        `\n  ${dropped.length} line(s) across ${affected.size} badge(s) dropped a specific:`,
      )
      for (const p of dropped.slice(0, 12)) console.log(`    - ${p}`)
      if (dropped.length > 12)
        console.log(`    … ${dropped.length - 12} more in the report`)
    }
    process.exitCode = 1
  }
}

await main()
