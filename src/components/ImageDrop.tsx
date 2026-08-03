import { useId, useState } from 'react'
import type { UploadedImage } from '../lib/sheet'

const MAX_BYTES = 8 * 1024 * 1024
/** Plenty for a 1.5in badge or a 300pt watermark at print resolution. */
const MAX_EDGE = 1200

/**
 * Re-encode to PNG through a canvas.
 *
 * Two reasons this is not optional: @react-pdf/renderer only accepts PNG and
 * JPEG, while the badge art people actually have is usually WebP; and a 500 KB
 * logo would otherwise be base64'd into every PDF at full size. The canvas
 * accepts anything the browser can decode (WebP, AVIF, GIF, SVG) and hands
 * back something the PDF renderer will take.
 */
async function toPngDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get a 2D canvas context.')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  return canvas.toDataURL('image/png')
}

/**
 * First image in a drop or a clipboard paste.
 *
 * `items` is what a screenshot paste populates (there is no file list for it),
 * while `files` covers a drag from the desktop — so both are checked.
 */
function imageFromTransfer(data: DataTransfer | null): File | null {
  if (!data) return null

  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }

  const file = data.files.item(0)
  return file && file.type.startsWith('image/') ? file : null
}

/**
 * Reads an image into a data URL. Everything stays in the browser — the image
 * is embedded straight into the PDF and never uploaded anywhere.
 */
export function ImageDrop({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: UploadedImage | null
  onChange: (image: UploadedImage | null) => void
}) {
  const inputId = useId()
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)

  async function read(file: File) {
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Images must be under 8 MB.')
      return
    }
    try {
      onChange({ name: file.name, dataUrl: await toPngDataUrl(file) })
    } catch {
      setError('Could not read that image. Try a PNG, JPEG, or WebP.')
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>

      <div
        // Focusable so a paste has an unambiguous target — there are two of
        // these on the page, and the focused one wins.
        tabIndex={0}
        role="group"
        aria-label={`${label}: drop, paste, or choose an image`}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPaste={(e) => {
          const file = imageFromTransfer(e.clipboardData)
          if (file) {
            e.preventDefault()
            void read(file)
          } else {
            setError('No image found on the clipboard.')
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const file = imageFromTransfer(e.dataTransfer)
          if (file) void read(file)
        }}
        className={`flex items-center gap-3 rounded-lg border border-dashed p-3 outline-none ${
          focused
            ? 'border-stone-800 bg-stone-50 ring-2 ring-stone-800/15'
            : 'border-stone-300 bg-white'
        }`}
      >
        {value ? (
          <img
            src={value.dataUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded object-contain"
          />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded bg-stone-100" />
        )}

        <div className="min-w-0 flex-1">
          <input
            id={inputId}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void read(file)
            }}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-stone-800 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-stone-700"
          />
          <p className="mt-1 text-xs text-stone-500">
            {focused
              ? 'Press ⌘V / Ctrl+V to paste an image.'
              : 'Drop, or click here and paste.'}
          </p>
          {value ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="mt-0.5 text-xs text-stone-500 underline"
            >
              Remove {value.name}
            </button>
          ) : hint ? (
            <p className="mt-0.5 text-xs text-stone-400">{hint}</p>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
