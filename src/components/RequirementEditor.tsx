import {
  canIndent,
  canOutdent,
  flatten,
  getsSignatureLine,
  isSignatureOverridden,
  moveRequirement,
  removeNode,
  toggleSignature,
  updateNode,
} from '../lib/requirements'
import type { Requirement } from '../lib/requirements'

/**
 * Flat, keyboard-friendly editor over the requirement tree. Rows mirror the
 * printed sheet exactly — same order, same indentation — so what you edit is
 * what prints.
 *
 * Every mutation here is a call into the tree algebra in `lib/requirements` —
 * this file owns none of it, so the editor and the parser stay in agreement
 * about what a requirement tree is.
 */

export function RequirementEditor({
  requirements,
  onChange,
}: {
  requirements: Array<Requirement>
  onChange: (next: Array<Requirement>) => void
}) {
  const rows = flatten(requirements)

  const patch = (
    id: string,
    part: Partial<Omit<Requirement, 'id' | 'children'>>,
  ) => onChange(updateNode(requirements, id, part))

  const remove = (id: string) => onChange(removeNode(requirements, id))

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
