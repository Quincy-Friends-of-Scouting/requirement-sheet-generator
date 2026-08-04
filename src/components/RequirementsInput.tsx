import { useState } from 'react'
import { SignInButton } from '@clerk/tanstack-react-start'

import { RequireSignIn } from '../lib/auth'
import { countNodes, toText } from '../lib/requirements'
import { parseRequirements } from '../lib/parse'
import { simplifyRequirements } from '../server/simplify'
import type { Requirement } from '../lib/requirements'

/**
 * The paste box and the two conversion buttons.
 *
 * This owns `source` and the transient status/error/busy flags rather than the
 * page above it. That is a performance boundary as much as a tidiness one:
 * these change on every keystroke, and while they lived on the page each
 * keystroke re-rendered the PDF preview too — which rebuilt the whole document
 * a beat later, for an edit that could not have changed it.
 */

const SAMPLE = `1. Do the following:
a. Explain to your counselor what the words genealogy, ancestor, and descendant mean.
b. Explain what a family tree is and what information would be kept there.
2. Do ONE of the following:
a. Create a time line for yourself or for a relative, then write a short biography based on it.
b. Keep a journal for six weeks. You must write in it at least once a week.`

export function RequirementsInput({
  badgeName,
  requirements,
  onRequirements,
}: {
  badgeName: string
  requirements: Array<Requirement>
  onRequirements: (next: Array<Requirement>) => void
}) {
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function structureOnly() {
    setError(null)
    const parsed = parseRequirements(source)
    onRequirements(parsed)
    setStatus(
      parsed.length
        ? `Parsed ${countNodes(parsed)} rows from the numbering. Wording unchanged.`
        : 'Nothing to parse yet.',
    )
  }

  async function simplify() {
    setError(null)
    setStatus(null)
    setBusy(true)
    try {
      const result = await simplifyRequirements({
        data: { text: source, badgeName: badgeName || undefined },
      })
      onRequirements(result.requirements)
      setStatus(
        result.note ??
          `Rewrote ${countNodes(result.requirements)} requirements to fit the sheet.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">2. Requirements</h2>
        <button
          type="button"
          onClick={() => setSource(SAMPLE)}
          className="text-xs text-stone-500 underline"
        >
          Load a sample
        </button>
      </div>

      <textarea
        value={source}
        onChange={(e) => setSource(e.target.value)}
        rows={10}
        placeholder="Paste the official requirements here, one per line…"
        className="w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm leading-relaxed"
      />

      <div className="flex flex-wrap items-center gap-2">
        <RequireSignIn
          fallback={
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-600"
              >
                Sign in to shorten with AI
              </button>
            </SignInButton>
          }
          unconfigured={
            <button
              type="button"
              disabled
              title="Set VITE_CLERK_PUBLISHABLE_KEY and ANTHROPIC_API_KEY to enable this"
              className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white opacity-40"
            >
              Shorten with AI (not configured)
            </button>
          }
        >
          <button
            type="button"
            onClick={() => void simplify()}
            disabled={busy || !source.trim()}
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            {busy ? 'Rewriting…' : 'Shorten with AI'}
          </button>
        </RequireSignIn>

        <button
          type="button"
          onClick={structureOnly}
          disabled={!source.trim()}
          className="rounded-md border border-stone-300 px-3 py-2 text-sm hover:bg-stone-100 disabled:opacity-40"
        >
          Use as-is
        </button>

        {requirements.length ? (
          <button
            type="button"
            onClick={() => setSource(toText(requirements))}
            className="text-xs text-stone-500 underline"
          >
            Copy edits back to the box
          </button>
        ) : null}
      </div>

      {status ? <p className="text-xs text-stone-600">{status}</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </section>
  )
}
