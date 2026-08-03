import { Suspense, lazy, useState } from 'react'
import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { SignInButton } from '@clerk/tanstack-react-start'

import { RequireSignIn } from '../lib/auth'
import { ImageDrop } from '../components/ImageDrop'
import { RequirementEditor } from '../components/RequirementEditor'
import { DEFAULT_SHEET } from '../lib/sheet'
import { countNodes, toText } from '../lib/requirements'
import { parseRequirements } from '../lib/parse'
import { simplifyRequirements } from '../server/simplify'
import type { PdfView } from '../components/PdfPreview'
import type { SheetSpec } from '../lib/sheet'

const PdfPreview = lazy(() => import('../components/PdfPreview'))

export const Route = createFileRoute('/')({ component: Builder })

/** Roughly what fits on one page before the sheet spills onto a second. */
const ROWS_PER_PAGE = 26

/**
 * The two things that can be printed. Ticking both is what selects the
 * combined document, so there is no separate "Both" box to keep in sync.
 */
const PARTS = [
  { id: 'sheet', label: 'Requirement sheet' },
  { id: 'poster', label: 'Table sign' },
] as const

type PartId = (typeof PARTS)[number]['id']

/**
 * Occupies exactly the space the real preview will, so mounting the
 * lazily-loaded renderer does not shove the page around. The bar and body use
 * the same classes as `PdfPreview`, which is what keeps the heights identical
 * — worth keeping in sync if that layout changes.
 */
function PreviewSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-3 py-2">
        <span className="text-sm font-medium">&nbsp;</span>
        {/* Matches the Download button's box so the bar is the same height. */}
        <span aria-hidden className="invisible px-3 py-1.5 text-sm">
          Download PDF
        </span>
      </div>
      <div className="flex min-h-[70vh] flex-1 items-center justify-center bg-stone-100 text-sm text-stone-500">
        Preparing preview…
      </div>
    </div>
  )
}

const SAMPLE = `1. Do the following:
a. Explain to your counselor what the words genealogy, ancestor, and descendant mean.
b. Explain what a family tree is and what information would be kept there.
2. Do ONE of the following:
a. Create a time line for yourself or for a relative, then write a short biography based on it.
b. Keep a journal for six weeks. You must write in it at least once a week.`

function Builder() {
  const [spec, setSpec] = useState<SheetSpec>(DEFAULT_SHEET)
  const [source, setSource] = useState('')
  const [parts, setParts] = useState<ReadonlyArray<PartId>>(['sheet'])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const patch = (part: Partial<SheetSpec>) =>
    setSpec((prev) => ({ ...prev, ...part }))

  const view: PdfView = parts.length === 2 ? 'both' : parts[0]

  /**
   * Untickable down to one box: with nothing selected there is no document to
   * preview or download, so the last remaining box is disabled rather than
   * letting the panel go empty.
   */
  const toggle = (id: PartId) =>
    setParts((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((p) => p !== id)
          : prev
        : // Keep sheet-before-poster order so `parts[0]` is stable.
          PARTS.map((p) => p.id).filter((p) => p === id || prev.includes(p)),
    )

  const rowCount = countNodes(spec.requirements)

  function structureOnly() {
    setError(null)
    const requirements = parseRequirements(source)
    patch({ requirements })
    setStatus(
      requirements.length
        ? `Parsed ${countNodes(requirements)} rows from the numbering. Wording unchanged.`
        : 'Nothing to parse yet.',
    )
  }

  async function simplify() {
    setError(null)
    setStatus(null)
    setBusy(true)
    try {
      const result = await simplifyRequirements({
        data: { text: source, badgeName: spec.badgeName || undefined },
      })
      patch({ requirements: result.requirements })
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
    <main className="mx-auto grid max-w-350 gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ------------------------------- editor ------------------------------ */}
      <div className="space-y-6">
        <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
          <h2 className="font-semibold">1. Badge</h2>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Badge name</span>
            <input
              value={spec.badgeName}
              onChange={(e) => patch({ badgeName: e.target.value })}
              placeholder="Genealogy"
              className="w-full rounded-md border border-stone-300 px-3 py-2"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <ImageDrop
              label="Badge image"
              hint="Square works best — it prints at 1.5 in."
              value={spec.badgeImage}
              onChange={(badgeImage) => patch({ badgeImage })}
            />
            <ImageDrop
              label="Watermark / logo (optional)"
              hint="Printed faintly behind the sheet."
              value={spec.watermark}
              onChange={(watermark) => patch({ watermark })}
            />
          </div>
        </section>

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

            {spec.requirements.length ? (
              <button
                type="button"
                onClick={() => setSource(toText(spec.requirements))}
                className="text-xs text-stone-500 underline"
              >
                Copy edits back to the box
              </button>
            ) : null}
          </div>

          {status ? <p className="text-xs text-stone-600">{status}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </section>

        <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">3. Review</h2>
            <span
              className={`text-xs ${
                rowCount > ROWS_PER_PAGE ? 'text-amber-700' : 'text-stone-500'
              }`}
            >
              {rowCount} rows
              {rowCount > ROWS_PER_PAGE
                ? ' — likely spills onto a second page'
                : ''}
            </span>
          </div>

          <p className="text-xs text-stone-500">
            The underline button toggles that row's signature line. By default
            only rows without sub-requirements get one; an amber dot marks a row
            where you have overridden that.
          </p>

          <RequirementEditor
            requirements={spec.requirements}
            onChange={(requirements) => patch({ requirements })}
          />
        </section>
      </div>

      {/* ------------------------------ preview ------------------------------ */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-stone-200 px-3 py-2">
            {PARTS.map(({ id, label }) => {
              const checked = parts.includes(id)
              const last = checked && parts.length === 1
              return (
                <label
                  key={id}
                  title={last ? 'Keep at least one selected' : undefined}
                  className={`flex items-center gap-2 text-sm ${
                    last ? 'text-stone-500' : 'cursor-pointer text-stone-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={last}
                    onChange={() => toggle(id)}
                    className="size-4 accent-stone-800"
                  />
                  {label}
                </label>
              )
            })}
          </div>

          <ClientOnly fallback={<PreviewSkeleton />}>
            <Suspense fallback={<PreviewSkeleton />}>
              <PdfPreview spec={spec} view={view} />
            </Suspense>
          </ClientOnly>
        </div>
      </div>
    </main>
  )
}
