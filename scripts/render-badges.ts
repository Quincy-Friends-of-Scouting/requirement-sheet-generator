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
 * PDFs land in `data/sheets/<source>/`. Page counts come from `pdfinfo`
 * (poppler); without it the render still runs and the count is skipped.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createElement } from 'react'
import { renderToFile } from '@react-pdf/renderer'
import { withIds } from 'requirement-tree'
import { RequirementSheet } from '../src/pdf/RequirementSheet'
import { DEFAULT_SHEET } from '../src/lib/sheet'
import type { DocumentProps } from '@react-pdf/renderer'

const ROOT = path.join(import.meta.dirname, '..')
const DATA = path.join(ROOT, 'data')

const source = process.argv[2] === 'badges' ? 'badges' : 'simplified'
const SRC_DIR = path.join(DATA, source)
const OUT_DIR = path.join(DATA, 'sheets', source)

/** @react-pdf takes PNG and JPEG only — the corpus is normalised to PNG. */
async function badgeImage(slug: string) {
  const file = path.join(DATA, 'images', `${slug}.png`)
  if (!existsSync(file)) return null
  return {
    name: `${slug}.png`,
    dataUrl: `data:image/png;base64,${(await readFile(file)).toString('base64')}`,
  }
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
  const files = (await readdir(SRC_DIR))
    .filter((f) => f.endsWith('.json'))
    .sort()
  if (!files.length) throw new Error(`no badge JSON in ${SRC_DIR}`)

  const overflow: Array<{ slug: string; pages: number; rows: number }> = []
  let counted = 0
  let rendered = 0

  for (const file of files) {
    const badge = JSON.parse(await readFile(path.join(SRC_DIR, file), 'utf8'))
    const out = path.join(OUT_DIR, `${badge.slug}.pdf`)

    await renderToFile(
      createElement(RequirementSheet, {
        spec: {
          ...DEFAULT_SHEET,
          badgeName: badge.name,
          requirements: withIds(badge.requirements),
          badgeImage: await badgeImage(badge.slug),
        },
      }) as React.ReactElement<DocumentProps>,
      out,
    )
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
    `\nrendered ${rendered} sheets from data/${source} to ${path.relative(ROOT, OUT_DIR)}`,
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
