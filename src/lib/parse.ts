import { withIds } from './requirements'
import type { Requirement, RequirementInput } from './requirements'

/**
 * Deterministic parser for pasted requirement text.
 *
 * This is the no-AI path: it recovers the tree from the numbering markers
 * alone. The AI path (see `src/server/simplify.ts`) produces the same shape,
 * so the editor and the PDF never need to know which one ran.
 */

interface Marker {
  label: string
  rest: string
  rank: number
}

/**
 * Ranks are ordered by how BSA requirement sheets nest: arabic numerals at the
 * top, then letters, then parenthesized numerals. A parenthesized letter is
 * treated as a letter so "(a)" and "a." don't split into two levels.
 */
const MARKER_PATTERNS: Array<{ re: RegExp; rank: number }> = [
  { re: /^\((\d+)\)\s+/, rank: 2 },
  { re: /^\(([a-z])\)\s+/i, rank: 1 },
  { re: /^(\d+)[.)]\s+/, rank: 0 },
  { re: /^([a-z])[.)]\s+/, rank: 1 },
  { re: /^([ivx]+)[.)]\s+/i, rank: 2 },
]

/**
 * Lines that annotate a requirement instead of being one. Requirements pasted
 * from the online handbook carry "Resource: <title> (video)" links under many
 * items; nobody signs off on a link, so they never enter the tree.
 *
 * Two things keep this from eating real requirements. Markers are read first,
 * so "(a) Resource management" is already a row before this test runs; and the
 * colon is required, so prose that merely opens with the word ("Resources are
 * limited...") is untouched. What is left ambiguous is unnumbered leading prose
 * that genuinely starts "Resource:" — which would be indistinguishable from an
 * annotation to a human reader too.
 */
const ANNOTATION_RE = /^resources?\s*:/i

/**
 * Remove annotation lines from pasted text, along with any lines they wrap
 * onto — a stray URL left behind would otherwise read as continuation prose and
 * glue itself to the requirement above. A marker, or a blank line, ends the
 * annotation, so over-swallowing is bounded by the next real line.
 *
 * Exported because both paths need it: the parser runs it first, and the AI
 * path strips the prompt so the model is never shown links it might keep.
 */
export function stripAnnotations(input: string): string {
  const kept: Array<string> = []
  let inAnnotation = false

  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim()

    if (!line) {
      inAnnotation = false
    } else if (readMarker(line)) {
      inAnnotation = false
    } else if (ANNOTATION_RE.test(line)) {
      inAnnotation = true
    }

    if (!inAnnotation) kept.push(raw)
  }

  return kept.join('\n')
}

function readMarker(line: string): Marker | null {
  for (const { re, rank } of MARKER_PATTERNS) {
    const m = re.exec(line)
    if (m) {
      return {
        label: m[0].trim(),
        rest: line.slice(m[0].length).trim(),
        rank,
      }
    }
  }
  return null
}

interface Row {
  label: string
  text: string
  rank: number
  indent: number
}

/**
 * Join wrapped lines back onto their requirement. A line only starts a new
 * requirement if it carries a marker; anything else is continuation prose.
 */
function toRows(input: string): Array<Row> {
  const rows: Array<Row> = []

  for (const raw of input.split(/\r?\n/)) {
    if (!raw.trim()) continue

    const indent = raw.length - raw.trimStart().length
    const line = raw.trim()
    const marker = readMarker(line)

    if (marker) {
      rows.push({
        label: marker.label,
        text: marker.rest,
        rank: marker.rank,
        indent,
      })
    } else if (rows.length) {
      const prev = rows[rows.length - 1]
      prev.text = `${prev.text} ${line}`.trim()
    } else {
      // Leading unnumbered prose — keep it as its own top-level item.
      rows.push({ label: '', text: line, rank: 0, indent })
    }
  }

  return rows
}

/**
 * Some sources indent sub-requirements but reuse arabic numerals at every
 * level. When the markers alone are ambiguous, fall back to indentation.
 */
function resolveRanks(rows: Array<Row>): Array<Row> {
  const distinctRanks = new Set(rows.map((r) => r.rank))
  if (distinctRanks.size > 1) return rows

  const indents = [...new Set(rows.map((r) => r.indent))].sort((a, b) => a - b)
  if (indents.length < 2) return rows

  return rows.map((r) => ({ ...r, rank: indents.indexOf(r.indent) }))
}

export function parseRequirements(input: string): Array<Requirement> {
  const rows = resolveRanks(toRows(stripAnnotations(input)))
  if (!rows.length) return []

  const roots: Array<RequirementInput> = []
  // stack[i] is the most recent node seen at rank i.
  const stack: Array<RequirementInput | undefined> = []

  for (const row of rows) {
    const node: RequirementInput = {
      label: row.label,
      text: row.text,
      children: [],
    }

    // A sub-item with no parent yet (e.g. a paste starting at "a.") is promoted
    // to the top level rather than dropped.
    let rank = row.rank
    while (rank > 0 && !stack[rank - 1]) rank -= 1

    if (rank === 0) {
      roots.push(node)
    } else {
      stack[rank - 1]!.children.push(node)
    }

    stack[rank] = node
    stack.length = rank + 1
  }

  return withIds(roots)
}
