import {
  canIndent,
  canOutdent,
  flatten,
  getsSignatureLine,
  isSignatureOverridden,
  toggleSignature,
} from '../lib/requirements'
import type { Requirement } from '../lib/requirements'

/**
 * Flat, keyboard-friendly editor over the requirement tree. Rows mirror the
 * printed sheet exactly — same order, same indentation — so what you edit is
 * what prints. Indent/outdent re-parent a row within its sibling list.
 */

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

export function moveRequirement(
  nodes: Array<Requirement>,
  id: string,
  direction: 'in' | 'out',
): Array<Requirement> {
  return direction === 'in' ? indent(nodes, id) : outdent(nodes, id)
}

export function RequirementEditor({
  requirements,
  onChange,
}: {
  requirements: Array<Requirement>
  onChange: (next: Array<Requirement>) => void
}) {
  const rows = flatten(requirements)

  function patch(id: string, part: Partial<Requirement>) {
    const walk = (nodes: Array<Requirement>): Array<Requirement> =>
      nodes.map((n) =>
        n.id === id
          ? { ...n, ...part, children: n.children }
          : { ...n, children: walk(n.children) },
      )
    onChange(walk(requirements))
  }

  function remove(id: string) {
    const walk = (nodes: Array<Requirement>): Array<Requirement> =>
      nodes
        .filter((n) => n.id !== id)
        .map((n) => ({ ...n, children: walk(n.children) }))
    onChange(walk(requirements))
  }

  if (!rows.length) {
    return (
      <p className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-500">
        No requirements yet. Paste the badge requirements above and convert
        them.
      </p>
    )
  }

  return (
    <div className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
      {rows.map((row) => {
        const { requirement, depth } = row
        const signs = getsSignatureLine(requirement)
        const overridden = isSignatureOverridden(requirement)
        return (
          <div
            key={requirement.id}
            className="flex items-start gap-2 p-2"
            style={{ paddingLeft: 8 + depth * 20 }}
          >
            <input
              value={requirement.label}
              onChange={(e) => patch(requirement.id, { label: e.target.value })}
              placeholder="1."
              aria-label="Requirement number"
              className="w-14 shrink-0 rounded border border-stone-200 px-1.5 py-1 text-sm tabular-nums"
            />

            <textarea
              value={requirement.text}
              onChange={(e) => patch(requirement.id, { text: e.target.value })}
              rows={Math.max(1, Math.ceil(requirement.text.length / 90))}
              aria-label="Requirement text"
              className="min-w-0 flex-1 resize-y rounded border border-stone-200 px-2 py-1 text-sm leading-snug"
            />

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-pressed={signs}
                aria-label="Signature line"
                title={
                  (signs
                    ? 'Has a signature line — click to remove'
                    : 'No signature line — click to add') +
                  (overridden
                    ? '\nOverrides the default for this row'
                    : '\nFollowing the default for this row')
                }
                onClick={() =>
                  onChange(toggleSignature(requirements, requirement.id))
                }
                className="relative rounded p-1 hover:bg-stone-100"
              >
                {/* A short rule, not a checkbox: it is a miniature of the
                    line that prints in the initials column. */}
                <span
                  className={`block h-4 w-4 rounded-sm border-b-2 ${
                    signs ? 'border-b-stone-800' : 'border-b-stone-200'
                  }`}
                />
                {overridden ? (
                  <span
                    aria-hidden
                    className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-amber-500"
                  />
                ) : null}
              </button>
              <button
                type="button"
                disabled={!canOutdent(row)}
                title={canOutdent(row) ? 'Outdent' : 'Already at the top level'}
                onClick={() =>
                  onChange(moveRequirement(requirements, requirement.id, 'out'))
                }
                className="rounded px-1.5 py-1 text-sm text-stone-500 hover:bg-stone-100 disabled:pointer-events-none disabled:text-stone-300"
              >
                ←
              </button>
              <button
                type="button"
                disabled={!canIndent(row)}
                title={
                  canIndent(row)
                    ? 'Indent'
                    : 'Nothing above it at this level to nest under'
                }
                onClick={() =>
                  onChange(moveRequirement(requirements, requirement.id, 'in'))
                }
                className="rounded px-1.5 py-1 text-sm text-stone-500 hover:bg-stone-100 disabled:pointer-events-none disabled:text-stone-300"
              >
                →
              </button>
              <button
                type="button"
                title="Delete"
                onClick={() => remove(requirement.id)}
                className="rounded px-1.5 py-1 text-sm text-stone-400 hover:bg-red-50 hover:text-red-600"
              >
                ✕
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
