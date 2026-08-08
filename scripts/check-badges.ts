/**
 * Validate the scraped corpus in `data/`.
 *
 * Two kinds of finding, deliberately separated:
 *
 * **Problems** are the corpus failing its own invariants — a badge with no
 * requirements, no patch image, or top-level markers that don't read 1, 2, 3.
 * These fail the run.
 *
 * **Text-form differences** are badges whose `requirementsText` does not parse
 * back to the shape the markup gave us. These are reported but do not fail,
 * because a difference here is the text parser's business, not the scrape's.
 *
 * That second number is the useful one, and it is why this script is worth
 * keeping: the corpus is the only place we know the true tree independently of
 * parsing, because the scraper reads it from the page's own `mb-parent-N`
 * pointers. Rendering those trees back to text and re-parsing therefore
 * measures `requirement-tree` against 143 real documents — the regression test
 * the package cannot carry itself, since it may not ship Scouting America's
 * text. It found the fixed-rank ceiling that mis-nested 18 badges; it should
 * now read 143/143, and a drop is a parser regression.
 *
 * Consumers should still read `requirements`, the tree, rather than
 * re-parsing `requirementsText` — it is authoritative and free.
 *
 *   pnpm check:badges
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { countNodes, parseRequirements } from 'requirement-tree'

const DATA = path.join(import.meta.dirname, '..', 'data')
const BADGE_DIR = path.join(DATA, 'badges')

interface Node {
  label: string
  text: string
  children: Array<Node>
}

interface Badge {
  slug: string
  patchFile: string | null
  requirements: Array<Node>
  requirementsText: string
}

const countScraped = (nodes: Array<Node>): number =>
  nodes.reduce((n, c) => n + 1 + countScraped(c.children), 0)

function main() {
  const files = readdirSync(BADGE_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
  if (files.length === 0) throw new Error(`no badges in ${BADGE_DIR}`)

  const problems: Array<string> = []
  const textDiffs: Array<string> = []
  let roundTripped = 0

  for (const file of files) {
    const badge: Badge = JSON.parse(
      readFileSync(path.join(BADGE_DIR, file), 'utf8'),
    )
    const { slug, requirements: reqs } = badge

    if (reqs.length === 0) problems.push(`${slug}: no requirements`)
    if (!badge.patchFile) problems.push(`${slug}: no patch image`)

    // Top-level markers should read 1., 2., 3., … — a gap means the page's
    // numbering is malformed and the text form will mis-nest.
    const labels = reqs.map((r) => r.label)
    const expected = reqs.map((_, i) => `${i + 1}.`)
    if (labels.join() !== expected.join()) {
      problems.push(`${slug}: top-level labels ${labels.join(' ')}`)
    }

    const parsed = parseRequirements(badge.requirementsText)
    const scrapedNodes = countScraped(reqs)
    if (parsed.length === reqs.length && countNodes(parsed) === scrapedNodes) {
      roundTripped++
    } else {
      textDiffs.push(
        `${slug}: ${reqs.length} roots/${scrapedNodes} nodes became ` +
          `${parsed.length}/${countNodes(parsed)}`,
      )
    }
  }

  console.log(`${files.length} badges checked`)
  console.log(`${roundTripped}/${files.length} round-trip through the parser`)

  if (textDiffs.length) {
    console.log(
      `\n${textDiffs.length} badge(s) whose text form loses structure ` +
        `(use the tree, not requirementsText):`,
    )
    for (const d of textDiffs) console.log(`  - ${d}`)
  }

  if (problems.length === 0) {
    console.log('\nno problems')
    return
  }
  console.log(`\n${problems.length} problem(s):`)
  for (const p of problems) console.log(`  - ${p}`)
  process.exitCode = 1
}

main()
