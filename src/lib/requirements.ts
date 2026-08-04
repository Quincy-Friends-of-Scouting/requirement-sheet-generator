import { isLeaf, mapTree } from 'requirement-tree'
import type { RequirementBase } from 'requirement-tree'

/**
 * The sheet's view of a requirement.
 *
 * The tree itself and everything you can do to it live in `requirement-tree`.
 * What stays here is the one thing that is about a *printed sign-off sheet*
 * rather than about a requirement: whether a row prints a rule for the
 * counselor to initial.
 *
 * Re-exported through this module so the app has a single import site, and so
 * the package's generic operations are seen returning `Requirement` — ours,
 * with `signable` intact — rather than the bare tree type.
 */
export interface Requirement extends RequirementBase<Requirement> {
  /**
   * Forces a signature rule on or off, overriding the leaf default. Left
   * undefined the row follows its structure, so indenting or outdenting keeps
   * doing the sensible thing; it is only ever set when the author disagrees
   * with that default — e.g. a "Do ONE of the following:" parent that is
   * itself signed off once.
   */
  signable?: boolean
}

export {
  parseRequirements,
  stripAnnotations,
  requirementSchema,
  requirementListSchema,
  requirementJsonSchema,
  withIds,
  emptyRequirement,
  isLeaf,
  countNodes,
  flatten,
  canIndent,
  canOutdent,
  mapTree,
  updateNode,
  removeNode,
  moveRequirement,
  toText,
} from 'requirement-tree'

export type {
  RequirementBase,
  RequirementInput,
  FlatRow,
} from 'requirement-tree'

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
