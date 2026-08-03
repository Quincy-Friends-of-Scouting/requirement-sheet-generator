import { useCallback, useEffect, useRef, useState } from 'react'
import { usePDF } from '@react-pdf/renderer'
import {
  BadgePoster,
  CombinedDocument,
  RequirementSheet,
} from '../pdf/RequirementSheet'
import { slugify } from '../lib/sheet'
import type { DocumentProps } from '@react-pdf/renderer'
import type { SheetSpec } from '../lib/sheet'

/**
 * Renders the PDF in the browser and shows it in an iframe. Nothing is sent to
 * a server — the same blob backs both the preview and the download link.
 *
 * This module pulls in @react-pdf/renderer, which is browser-only, so it is
 * always mounted behind `<ClientOnly>`.
 */

/** Quiet period after the last edit before we re-render the document. */
const DEBOUNCE_MS = 350

/**
 * `load` fires when the viewer's document is ready, which is *before* it has
 * painted a page — promoting right then is what still showed a black frame.
 * Give the viewer this long to put pixels up before revealing it.
 */
const PAINT_SETTLE_MS = 400

/**
 * The very first PDF in a tab also has to boot Chrome's PDF extension, which
 * takes longer than a subsequent navigation the plugin is already warm for.
 * Only the initial reveal waits this long; later swaps use PAINT_SETTLE_MS.
 */
const FIRST_PAINT_SETTLE_MS = 1200

/**
 * How long to wait for an iframe `load` before promoting the new frame anyway.
 * Only reached in engines that never fire `load` for an embedded PDF.
 */
const PROMOTE_FALLBACK_MS = 900

/**
 * Chrome and Edge read these from the fragment to hide the PDF viewer's own
 * toolbar and sidebar, so the preview shows just the page. Firefox and Safari
 * ignore them harmlessly. Applied to the frame only — never to the download
 * link, where the fragment would end up in the saved filename.
 */
const VIEWER_PARAMS = '#toolbar=0&navpanes=0&statusbar=0&view=FitH'

/** Which of the two stacked iframes we are talking about. */
type Slot = 0 | 1

function Preview({
  document,
  filename,
  label,
}: {
  document: React.ReactElement<DocumentProps>
  filename: string
  label: string
}) {
  const [instance, update] = usePDF({ document })

  // usePDF caches the first document, so re-render whenever the spec changes —
  // but wait for a pause first, or every keystroke queues a full PDF build.
  useEffect(() => {
    const timer = setTimeout(() => update(document), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [document, update])

  /**
   * Two stacked iframes. A new PDF always loads into the hidden one, and they
   * swap only once it has had time to paint, so the visible frame never
   * navigates.
   *
   * Navigating a visible iframe is what caused the black flash: the browser
   * tears its PDF viewer down to a dark empty shell before the new document
   * paints. Note that waiting for `load` alone is not enough — the viewer
   * reports the document as loaded before the first page is on screen.
   */
  // Both halves live in one state value so every transition can be expressed
  // as an updater. That keeps `front` out of the effect's dependencies without
  // needing a lint suppression — re-running on a swap would mint a second URL
  // for a blob that is already on screen.
  const [buf, setBuf] = useState<{
    urls: [string | null, string | null]
    front: Slot
  }>({ urls: [null, null], front: 0 })

  // Promote by url identity, so a late timer can never demote a newer render.
  const promote = useCallback((url: string) => {
    setBuf((prev) => {
      const slot = prev.urls.indexOf(url) as Slot | -1
      return slot !== -1 && slot !== prev.front
        ? { ...prev, front: slot }
        : prev
    })
  }, [])

  // We mint the object URLs ourselves rather than using `instance.url`, which
  // usePDF revokes as soon as the next render starts — pulling the document
  // out from under the frame that is still showing it.
  useEffect(() => {
    if (!instance.blob) return
    const url = URL.createObjectURL(instance.blob)

    setBuf((prev) => {
      const back = (1 - prev.front) as Slot
      const urls: [string | null, string | null] = [...prev.urls]
      // Safe to revoke: this slot is off screen.
      const stale = urls[back]
      if (stale) URL.revokeObjectURL(stale)
      urls[back] = url
      return { ...prev, urls }
    })

    // Safety net. Promotion normally happens a beat after the frame's `load`,
    // but not every engine fires `load` for an embedded PDF — a browser
    // without a built-in viewer never does, which would strand the preview on
    // a blank frame forever. Waiting is recoverable; never swapping is not.
    const fallback = setTimeout(() => promote(url), PROMOTE_FALLBACK_MS)
    return () => clearTimeout(fallback)
  }, [instance.blob, promote])

  const bufRef = useRef(buf)
  useEffect(() => {
    bufRef.current = buf
  }, [buf])
  useEffect(
    () => () => {
      for (const url of bufRef.current.urls) {
        if (url) URL.revokeObjectURL(url)
      }
    },
    [],
  )

  const { urls, front } = buf
  // The back buffer holds the newest build; fall back to what is on screen.
  const newest = urls[1 - front] ?? urls[front]
  const hasRendered = urls[front] !== null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          {label}
          {instance.loading && hasRendered ? (
            <span className="text-xs font-normal text-stone-400">
              updating…
            </span>
          ) : null}
        </span>
        {/*
          The placeholder keeps the bar the same height before the first blob
          exists. Without it the bar grows when the button appears, nudging the
          whole preview down mid-load.
        */}
        {newest ? (
          <a
            href={newest}
            download={filename}
            className="rounded-md bg-stone-800 px-3 py-1.5 text-sm text-white hover:bg-stone-700"
          >
            Download PDF
          </a>
        ) : (
          <span aria-hidden className="invisible px-3 py-1.5 text-sm">
            Download PDF
          </span>
        )}
      </div>

      {instance.error ? (
        <p className="p-4 text-sm text-red-600">
          Could not render the PDF: {String(instance.error)}
        </p>
      ) : (
        <div className="relative min-h-[70vh] w-full flex-1 bg-stone-100">
          {/*
            Deliberately NOT wrapped in an `opacity-0` group before the first
            render. An opacity-0 *ancestor* makes Chrome skip rasterising the
            PDF plugin underneath it, so the frame was still blank when it got
            revealed. A hidden sibling inside a visible parent does keep
            painting, which is what the buffer swap relies on — so the frames
            stay laid out normally and the opaque overlay below covers the
            `about:blank` phase instead.
          */}
          <div>
            {([0, 1] as const).map((slot) => (
              <iframe
                key={slot}
                title={slot === front ? label : `${label} (loading)`}
                aria-hidden={slot !== front}
                src={
                  urls[slot] ? `${urls[slot]}${VIEWER_PARAMS}` : 'about:blank'
                }
                onLoad={() => {
                  // `load` means the viewer has the document, not that it has
                  // drawn it — reveal a beat later so the swap lands on pixels.
                  // `about:blank` fires load too, hence the url check.
                  const url = urls[slot]
                  if (url)
                    setTimeout(
                      () => promote(url),
                      hasRendered ? PAINT_SETTLE_MS : FIRST_PAINT_SETTLE_MS,
                    )
                }}
                // Swap instantly rather than cross-fading: both frames show
                // nearly identical pages, so a fade would only make the moment
                // of change visible as a dip in brightness.
                className={`absolute inset-0 h-full w-full border-0 ${
                  slot === front
                    ? 'opacity-100'
                    : 'pointer-events-none opacity-0'
                }`}
              />
            ))}
          </div>

          {!hasRendered ? (
            <p className="absolute inset-0 flex items-center justify-center bg-stone-100 text-sm text-stone-500">
              Rendering…
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

export type PdfView = 'sheet' | 'poster' | 'both'

export default function PdfPreview({
  spec,
  view,
}: {
  spec: SheetSpec
  view: PdfView
}) {
  const slug = slugify(spec.badgeName)

  // `key` matters: every branch renders the same `Preview` type at the same
  // position, so without it React keeps the previous view's buffers alive and
  // the Download button would briefly serve the old document under the new
  // filename. Remounting costs one "Rendering…" frame on a view switch.
  if (view === 'poster') {
    return (
      <Preview
        key="poster"
        document={<BadgePoster spec={spec} />}
        filename={`${slug}-sign.pdf`}
        label="Table sign"
      />
    )
  }

  if (view === 'both') {
    return (
      <Preview
        key="both"
        document={<CombinedDocument spec={spec} />}
        filename={`${slug}-sheet-and-sign.pdf`}
        label="Sheet + sign"
      />
    )
  }

  return (
    <Preview
      key="sheet"
      document={<RequirementSheet spec={spec} />}
      filename={`${slug}.pdf`}
      label="Requirement sheet"
    />
  )
}
