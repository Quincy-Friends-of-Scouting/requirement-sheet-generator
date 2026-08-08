/**
 * Write one plain-text worksheet per badge for the condensing pass.
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

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const files = (await readdir(BADGE_DIR))
    .filter((f) => f.endsWith('.json'))
    .sort()

  let lines = 0
  for (const file of files) {
    const badge = JSON.parse(await readFile(path.join(BADGE_DIR, file), 'utf8'))
    const rows = flatten(badge.requirements)
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

  console.log(
    `wrote ${files.length} worksheets (${lines} requirements) to ${path.relative(
      path.join(import.meta.dirname, '..'),
      OUT_DIR,
    )}`,
  )
}

await main()
