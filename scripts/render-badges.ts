/**
 * Render a sign-off sheet for every badge and report how many run past one page.
 *
 * This is the only honest answer to "does it fit on one page" — character
 * counts and 110-character targets are proxies, and the layout is what actually
 * decides. Run it against both sources to see what condensing bought:
 *
 *   pnpm render:badges            # from data/simplified (condensed)
 *   pnpm render:badges badges     # from data/badges (official wording)
 *
 * Each badge gets two separate files — the sheet in `data/sheets/<source>/` and
 * the table sign in `data/posters/`. Both carry the watermark from
 * `assets/watermark.png` if one is present; without it they render unmarked.
 *
 * The poster's badge name and image don't depend on requirement wording, so
 * it isn't split per source — a poster already on disk is skipped rather than
 * re-rendered when the other source runs.
 *
 * The poster multiplies watermark opacity by three internally, so a value tuned
 * for the dense sheet can dominate the mostly-empty sign. Override to taste:
 *
 *   WATERMARK_OPACITY=0.06 pnpm render:badges
 *
 * Page counts come from `pdfinfo` (poppler); without it the render still runs
 * and the count is skipped.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToFile } from '@react-pdf/renderer'
import { withIds } from 'requirement-tree'
import { BadgePoster, RequirementSheet } from '../src/pdf/RequirementSheet'
import { DEFAULT_SHEET } from '../src/lib/sheet'
import type { DocumentProps } from '@react-pdf/renderer'

const ROOT = path.join(import.meta.dirname, '..')
const DATA = path.join(ROOT, 'data')

const source = process.argv[2] === 'badges' ? 'badges' : 'simplified'
const SRC_DIR = path.join(DATA, source)
const OUT_DIR = path.join(DATA, 'sheets', source)
const POSTER_DIR = path.join(DATA, 'posters')

/** @react-pdf takes PNG and JPEG only — the corpus is normalised to PNG. */
async function badgeImage(slug: string) {
  const file = path.join(DATA, 'images', `${slug}.png`)
  if (!existsSync(file)) return null
  return {
    name: `${slug}.png`,
    dataUrl: `data:image/png;base64,${(await readFile(file)).toString('base64')}`,
  }
}

/**
 * The troop mark printed faintly behind both documents.
 *
 * Drop yours at `assets/watermark.png` (or .jpg). It is gitignored, like the
 * scraped corpus and for the same reason: this repo publishes the tool, not one
 * troop's material. So a clean checkout has no watermark, and that is the normal
 * case rather than an error — the sheets render unmarked and say so, and whoever
 * clones this supplies their own mark.
 *
 * PNG or JPEG only — @react-pdf accepts nothing else. If yours arrives as WebP:
 *   sips -s format png assets/watermark.webp --out assets/watermark.png
 */
async function watermark() {
  for (const [ext, mime] of [
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
  ]) {
    const file = path.join(ROOT, 'assets', `watermark.${ext}`)
    if (!existsSync(file)) continue
    return {
      name: `watermark.${ext}`,
      dataUrl: `data:${mime};base64,${(await readFile(file)).toString('base64')}`,
    }
  }
  return null
}

function pageCount(file: string): number | null {
  try {
    const out = execFileSync('pdfinfo', [file], { encoding: 'utf8' })
    return Number(/^Pages:\s+(\d+)$/m.exec(out)?.[1] ?? 0) || null
  } catch {
    return null
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  await mkdir(POSTER_DIR, { recursive: true })

  const mark = await watermark()
  console.log(
    mark
      ? `watermark: ${mark.name}`
      : 'no watermark found — add assets/watermark.png (PNG or JPEG)',
  )
  const files = (await readdir(SRC_DIR))
    .filter((f) => f.endsWith('.json'))
    .sort()
  if (!files.length) throw new Error(`no badge JSON in ${SRC_DIR}`)

  const overflow: Array<{ slug: string; pages: number; rows: number }> = []
  let counted = 0
  let rendered = 0
  let postersRendered = 0
  let postersSkipped = 0

  for (const file of files) {
    const badge = JSON.parse(await readFile(path.join(SRC_DIR, file), 'utf8'))
    const out = path.join(OUT_DIR, `${badge.slug}.pdf`)
    const posterOut = path.join(POSTER_DIR, `${badge.slug}.pdf`)

    const spec = {
      ...DEFAULT_SHEET,
      badgeName: badge.name,
      requirements: withIds(badge.requirements),
      badgeImage: await badgeImage(badge.slug),
      watermark: mark,
      watermarkOpacity: Number(
        process.env.WATERMARK_OPACITY ?? DEFAULT_SHEET.watermarkOpacity,
      ),
    }

    await renderToFile(
      createElement(RequirementSheet, {
        spec,
      }) as React.ReactElement<DocumentProps>,
      out,
    )
    // The poster is a separate document, not a second page — a counselor prints
    // the sheet per Scout and the sign once, so they never want them stapled.
    // Its content doesn't depend on requirement wording, so once it exists for
    // a slug (from either source) there's no need to re-render it.
    if (existsSync(posterOut)) {
      postersSkipped += 1
    } else {
      await renderToFile(
        createElement(BadgePoster, {
          spec,
        }) as React.ReactElement<DocumentProps>,
        posterOut,
      )
      postersRendered += 1
    }
    rendered += 1

    const pages = pageCount(out)
    if (pages !== null) {
      counted += 1
      if (pages > 1) {
        const rows =
          JSON.stringify(badge.requirements).split('"text"').length - 1
        overflow.push({ slug: badge.slug, pages, rows })
      }
    }
    if (rendered % 25 === 0) console.log(`  … ${rendered}/${files.length}`)
  }

  console.log(
    `\nrendered ${rendered} sheets from data/${source}, ${postersRendered} posters (${postersSkipped} already present)\n  sheets:  ${path.relative(ROOT, OUT_DIR)}\n  posters: ${path.relative(ROOT, POSTER_DIR)}`,
  )
  if (!counted) {
    console.log('pdfinfo not available — page counts skipped')
    return
  }

  overflow.sort((a, b) => b.pages - a.pages || b.rows - a.rows)
  console.log(`${counted - overflow.length}/${counted} fit on one page`)
  if (overflow.length) {
    console.log(`\n${overflow.length} run long:`)
    for (const o of overflow)
      console.log(`  - ${o.slug}: ${o.pages} pages (${o.rows} rows)`)
    await writeFile(
      path.join(DATA, `overflow-${source}.txt`),
      `${overflow.map((o) => `${o.slug}\t${o.pages}\t${o.rows}`).join('\n')}\n`,
    )
  }
}

await main()
