/**
 * Checks for the sheet-specific layer. Run with `pnpm test`.
 *
 * The parser and the tree algebra are tested in the `requirement-tree` package.
 * What is left here is the signature rule — the one thing that is about a
 * printed sign-off sheet rather than about a requirement — plus proof that the
 * package's generic operations carry this app's extra field through.
 */
import assert from 'node:assert/strict'
import {
  countNodes,
  flatten,
  getsSignatureLine,
  isSignatureOverridden,
  moveRequirement,
  parseRequirements,
  toggleSignature,
  updateNode,
} from './requirements'
import type { Requirement } from './requirements'

let passed = 0
const failures: Array<string> = []

function check(name: string, fn: () => void) {
  try {
    fn()
    passed += 1
  } catch (e) {
    failures.push(
      `${name}\n    ${e instanceof Error ? e.message.split('\n')[0] : e}`,
    )
  }
}

const TREE = `1. Do the following:
a. Name three widgets.
b. Name three gadgets.
2. Describe a sprocket.`

/**
 * The parser returns the package's plain tree; annotating adopts it as this
 * app's `Requirement`, which is what makes `signable` assignable below. App
 * code gets this for free by passing parse output into a typed prop.
 */
const parse = (text: string): Array<Requirement> => parseRequirements(text)

const byLabel = (nodes: Array<Requirement>, label: string): Requirement => {
  const hit = flatten(nodes).find((r) => r.requirement.label === label)
  if (!hit) throw new Error(`no row labelled ${label}`)
  return hit.requirement
}

// --------------------------------------------------------- signature rule ---

check('leaves get a signature line, parents do not', () => {
  const tree = parse(TREE)
  assert.equal(getsSignatureLine(byLabel(tree, '1.')), false)
  assert.equal(getsSignatureLine(byLabel(tree, 'a.')), true)
  assert.equal(getsSignatureLine(byLabel(tree, '2.')), true)
})

check('nothing is overridden by default', () => {
  const tree = parse(TREE)
  for (const { requirement } of flatten(tree)) {
    assert.equal(isSignatureOverridden(requirement), false)
  }
})

check('toggling a parent on marks it overridden', () => {
  const parsed = parse(TREE)
  const next = toggleSignature(parsed, byLabel(parsed, '1.').id)
  assert.equal(getsSignatureLine(byLabel(next, '1.')), true)
  assert.equal(isSignatureOverridden(byLabel(next, '1.')), true)
})

check('toggling twice clears the override rather than pinning it', () => {
  const parsed = parse(TREE)
  const id = byLabel(parsed, '1.').id
  const back = toggleSignature(toggleSignature(parsed, id), id)
  const row = byLabel(back, '1.')
  assert.equal(row.signable, undefined, 'should follow the tree again')
  assert.equal(isSignatureOverridden(row), false)
})

check('an unknown id changes nothing', () => {
  const parsed = parse(TREE)
  assert.equal(countNodes(toggleSignature(parsed, 'nope')), countNodes(parsed))
})

// -------------------------------------------- the extra field survives ops ---

check('signable survives updateNode and moveRequirement', () => {
  const parsed = parse(TREE)
  const id = byLabel(parsed, 'b.').id

  const marked = updateNode(parsed, id, { signable: false })
  assert.equal(byLabel(marked, 'b.').signable, false)

  // Outdenting re-parents the row; the field has to come with it.
  const moved = moveRequirement(marked, id, 'out')
  assert.equal(byLabel(moved, 'b.').signable, false)
})

check('a signature override outlives an indent', () => {
  const parsed = parse(TREE)
  const id = byLabel(parsed, '2.').id
  const overridden = toggleSignature(parsed, id) // leaf -> off
  const moved = moveRequirement(overridden, id, 'in')
  assert.equal(getsSignatureLine(byLabel(moved, '2.')), false)
})

for (const f of failures) console.error(`  ✗ ${f}`)
console.log(`${passed} passed, ${failures.length} failed`)
if (failures.length) process.exit(1)
