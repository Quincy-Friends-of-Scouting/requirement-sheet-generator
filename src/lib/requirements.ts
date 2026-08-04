import { z } from 'zod'

/**
 * A requirement is a tree. In the original Python badge modules this was
 * `[text, [subitems]]` with an optional third level of `{key: [sub-subitems]}`;
 * here it is uniform recursion so depth is not capped at three.
 *
 * `label` is the marker printed before the text ("1.", "a.", "(1)"). It is kept
 * separate from `text` so the AI can rewrite prose without touching numbering.
 *
 * By default only leaves get a signature rule on the sheet — a parent like
 * "1. Do the following:" is a header, not something a counselor initials.
 */
export interface Requirement {
  id: string
  label: string
  text: string
  children: Array<Requirement>
  /**
   * Forces a signature rule on or off, overriding the leaf default. Left
   * undefined the row follows its structure, so indenting or outdenting keeps
   * doing the sensible thing; it is only ever set when the author disagrees
   * with that default — e.g. a "Do ONE of the following:" parent that is
   * itself signed off once.
   */
  signable?: boolean
}

/** The same tree before ids are assigned — what the parser and the AI produce. */
export interface RequirementInput {
  label: string
  text: string
  children: Array<RequirementInput>
}

export const requirementSchema: z.ZodType<RequirementInput> = z.object({
  label: z.string().default(''),
  text: z.string(),
  children: z.lazy(() => z.array(requirementSchema)).default([]),
})

export const requirementListSchema = z.array(requirementSchema)

/** JSON Schema handed to the model. Kept in lockstep with the Zod schema above. */
export function requirementJsonSchema(maxDepth = 3): Record<string, unknown> {
  const node = (depth: number): Record<string, unknown> => ({
    type: 'object',
    properties: {
      label: {
        type: 'string',
        description:
          'The numbering marker exactly as it appears in the source, e.g. "1.", "a.", "(1)". Empty string if the item is unnumbered.',
      },
      text: {
        type: 'string',
        description:
          'The requirement restated as one plain sentence, with the label removed.',
      },
      ...(depth > 0
        ? {
            children: {
              type: 'array',
              description:
                'Sub-requirements nested under this one. Empty when there are none.',
              items: node(depth - 1),
            },
          }
        : {}),
    },
    required: depth > 0 ? ['label', 'text', 'children'] : ['label', 'text'],
    additionalProperties: false,
  })

  return {
    type: 'object',
    properties: {
      requirements: {
        type: 'array',
        description: 'The badge requirements, in their original order.',
        items: node(maxDepth - 1),
      },
    },
    required: ['requirements'],
    additionalProperties: false,
  }
}

let counter = 0
function nextId() {
  counter += 1
  return `r${counter}`
}

/** Attach stable ids so React keys and editor edits survive re-renders. */
export function withIds(nodes: Array<RequirementInput>): Array<Requirement> {
  return nodes.map((n) => ({
    id: nextId(),
    label: n.label,
    text: n.text,
    children: withIds(n.children),
  }))
}

export function emptyRequirement(): Requirement {
  return { id: nextId(), label: '', text: '', children: [] }
}

export function isLeaf(r: Requirement) {
  return r.children.length === 0
}

/** Whether this row prints a rule for the counselor to initial. */
export function getsSignatureLine(r: Requirement) {
  return r.signable ?? isLeaf(r)
}

/** True when the author has overridden the structural default. */
export function isSignatureOverridden(r: Requirement) {
  return r.signable !== undefined && r.signable !== isLeaf(r)
}

/**
 * Flip the signature rule for one row.
 *
 * The override is cleared whenever the requested value matches what the
 * structure would give anyway, so a row never sits pinned to a value that
 * merely happens to agree — toggling twice returns it to following the tree
 * rather than leaving invisible state behind.
 */
export function toggleSignature(
  nodes: Array<Requirement>,
  id: string,
): Array<Requirement> {
  return mapTree(nodes, (n) => {
    if (n.id !== id) return n
    const next = !getsSignatureLine(n)
    return { ...n, signable: next === isLeaf(n) ? undefined : next }
  })
}

/** Total number of nodes — used to warn when a sheet will not fit on one page. */
export function countNodes(nodes: Array<Requirement>): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0)
}

/** Depth-first map, returning a new tree. */
export function mapTree(
  nodes: Array<Requirement>,
  fn: (r: Requirement) => Requirement,
): Array<Requirement> {
  return nodes.map((n) => {
    const next = fn(n)
    return { ...next, children: mapTree(next.children, fn) }
  })
}

export function updateNode(
  nodes: Array<Requirement>,
  id: string,
  patch: Partial<Omit<Requirement, 'id' | 'children'>>,
): Array<Requirement> {
  return mapTree(nodes, (n) => (n.id === id ? { ...n, ...patch } : n))
}

export function removeNode(
  nodes: Array<Requirement>,
  id: string,
): Array<Requirement> {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children, id) }))
}

export interface FlatRow {
  requirement: Requirement
  depth: number
  /** Position among its siblings — the editor needs it to know if it can indent. */
  siblingIndex: number
}

/** Flatten to rows in print order. */
export function flatten(nodes: Array<Requirement>, depth = 0): Array<FlatRow> {
  return nodes.flatMap((n, siblingIndex) => [
    { requirement: n, depth, siblingIndex },
    ...flatten(n.children, depth + 1),
  ])
}

/** A row can nest under the sibling above it — the first one has nothing to nest under. */
export function canIndent(row: FlatRow) {
  return row.siblingIndex > 0
}

/** Top-level rows have nowhere to be promoted to. */
export function canOutdent(row: FlatRow) {
  return row.depth > 0
}

/** Make the row the last child of its previous sibling. */
function indent(nodes: Array<Requirement>, id: string): Array<Requirement> {
  const i = nodes.findIndex((n) => n.id === id)

  if (i === 0) return nodes // nothing above it to nest under
  if (i > 0) {
    const next = [...nodes]
    const [moved] = next.splice(i, 1)
    const prev = next[i - 1]
    next[i - 1] = { ...prev, children: [...prev.children, moved] }
    return next
  }

  return nodes.map((n) => ({ ...n, children: indent(n.children, id) }))
}

/**
 * Promote the row to sit just after its former parent. Rows that followed it
 * under that parent come along as its children, which is how outline editors
 * behave and keeps the printed order stable.
 */
function outdent(nodes: Array<Requirement>, id: string): Array<Requirement> {
  const pi = nodes.findIndex((n) => n.children.some((c) => c.id === id))

  if (pi !== -1) {
    const parent = nodes[pi]
    const at = parent.children.findIndex((c) => c.id === id)
    const moved = parent.children[at]
    const trailing = parent.children.slice(at + 1)

    const next = [...nodes]
    next[pi] = { ...parent, children: parent.children.slice(0, at) }
    next.splice(pi + 1, 0, {
      ...moved,
      children: [...moved.children, ...trailing],
    })
    return next
  }

  return nodes.map((n) => ({ ...n, children: outdent(n.children, id) }))
}

/** Re-parent one row within its sibling list. */
export function moveRequirement(
  nodes: Array<Requirement>,
  id: string,
  direction: 'in' | 'out',
): Array<Requirement> {
  return direction === 'in' ? indent(nodes, id) : outdent(nodes, id)
}

/** Round-trip a tree back to the indented text format the parser accepts. */
export function toText(nodes: Array<Requirement>, depth = 0): string {
  return nodes
    .flatMap((n) => [
      `${'  '.repeat(depth)}${[n.label, n.text].filter(Boolean).join(' ')}`,
      ...(n.children.length ? [toText(n.children, depth + 1)] : []),
    ])
    .join('\n')
}
