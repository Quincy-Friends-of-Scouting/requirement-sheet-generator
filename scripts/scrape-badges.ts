/**
 * Scrape the official merit badge list and requirements from scouting.org into
 * a local, untracked `data/` directory.
 *
 * The pages are Elementor-generated and the requirement markup is emitted by a
 * BSA plugin, so it is regular enough to read with regexes: every requirement
 * is a `mb-requirement-id-N` node and every child carries `mb-parent-N`. That
 * parent pointer is the real tree — the visible "(a)" / "(1)" markers are flat
 * in the DOM — so we rebuild structure from ids rather than re-parsing prose.
 *
 * Two passes, both resumable and both reading from the on-disk HTML cache:
 *
 *   pnpm scrape:badges           fetch anything missing, then extract
 *   pnpm scrape:badges --extract re-extract from cache only, no network
 *
 * Be polite: scouting.org's robots.txt asks for Crawl-delay: 15. That is the
 * default; override with SCRAPE_DELAY_MS when you have a reason to.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ORIGIN = 'https://www.scouting.org'
const INDEX_URL = `${ORIGIN}/skills/merit-badges/all/`
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'

const ROOT = path.resolve(import.meta.dirname, '..')
const DATA = path.join(ROOT, 'data')
const HTML_DIR = path.join(DATA, 'html')
const IMG_DIR = path.join(DATA, 'images')
const BADGE_DIR = path.join(DATA, 'badges')

const DELAY_MS = Number(process.env.SCRAPE_DELAY_MS ?? 15_000)
const extractOnly = process.argv.includes('--extract')

// ---------------------------------------------------------------- types

interface Resource {
  title: string
  url: string
}

interface ScrapedRequirement {
  /** The marker as printed: "1.", "(a)", "(1)". */
  label: string
  text: string
  /** "Resource:" links that trail the requirement text on the page. */
  resources: Array<Resource>
  children: Array<ScrapedRequirement>
}

interface IndexEntry {
  slug: string
  name: string
  url: string
  /** The site's own grouping: "outdoor", "stem", "trades", … */
  category: string
  /** Site flag whose meaning is undocumented; carried through verbatim. */
  drg: boolean
  cardImage: string | null
}

interface Badge extends IndexEntry {
  /** The 240x240 patch graphic on the badge page. */
  patchImage: string | null
  patchFile: string | null
  /** Standalone notes above the numbered list (pamphlet links, etc.). */
  notes: Array<string>
  pdfs: { requirements: Array<string>; pamphlet: Array<string> }
  requirements: Array<ScrapedRequirement>
  /** The tree flattened back to indented text — what the app's paste box eats. */
  requirementsText: string
  scrapedAt: string
}

// ---------------------------------------------------------------- html utils

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  deg: '°',
  frac12: '½',
  frac14: '¼',
  times: '×',
  eacute: 'é',
}

function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z][a-z0-9]*);/gi, (whole, name: string) =>
      Object.hasOwn(NAMED_ENTITIES, name.toLowerCase())
        ? NAMED_ENTITIES[name.toLowerCase()]
        : whole,
    )
}

/** HTML fragment → single-line plain text. */
function toPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|li|div)>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function anchors(html: string): Array<Resource> {
  const out: Array<Resource> = []
  const re = /<a\b[^>]*?href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    out.push({ title: toPlainText(m[2]), url: decodeEntities(m[1]).trim() })
  }
  return out
}

/**
 * The page appends reading material to many requirements as
 * `<br><i>Resource:</i> <a…>`. It is not part of the requirement, and the
 * printable sheet does not want it, so split it off rather than strip it.
 */
function splitResources(html: string): {
  text: string
  resources: Array<Resource>
} {
  const marker = /<br\s*\/?>\s*<i>\s*Resources?\s*:\s*<\/i>/i
  const at = html.search(marker)
  if (at === -1) return { text: toPlainText(html), resources: [] }
  return {
    text: toPlainText(html.slice(0, at)),
    resources: anchors(html.slice(at)),
  }
}

// ---------------------------------------------------------------- fetching

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`)
  return res.text()
}

/**
 * Fetch through the on-disk cache. Returns null under --extract when the page
 * was never fetched, so a partial cache still re-extracts cleanly.
 */
async function cachedPage(
  url: string,
  file: string,
): Promise<{ html: string; fetched: boolean } | null> {
  if (existsSync(file))
    return { html: await readFile(file, 'utf8'), fetched: false }
  if (extractOnly) return null
  const html = await fetchText(url)
  await writeFile(file, html)
  return { html, fetched: true }
}

async function downloadImage(url: string, file: string): Promise<boolean> {
  if (existsSync(file)) return false
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`${res.status} — ${url}`)
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
  return true
}

// ---------------------------------------------------------------- index page

function parseIndex(html: string): Array<IndexEntry> {
  const bySlug = new Map<string, IndexEntry>()
  for (const article of html.split('<article ').slice(1)) {
    // An Eagle-required card links to its own badge page twice: once
    // wrapping the "Eagle Scout insignia" ribbon icon, then again — as the
    // card's title — wrapping the actual name. Both anchors share the same
    // href, and the icon always sorts first, so the title is whichever
    // match comes last.
    const links = [
      ...article.matchAll(
        /<a href="(https:\/\/www\.scouting\.org\/merit-badges\/([a-z0-9-]+)\/)">([\s\S]*?)<\/a>/g,
      ),
    ]
    const link = links.at(-1)
    if (!link) continue
    const [, url, slug, rawName] = link
    if (bySlug.has(slug)) continue // the grid repeats a couple of cards
    bySlug.set(slug, {
      slug,
      name: toPlainText(rawName),
      url,
      category: /mb_card_grouping-([a-z0-9-]+)/.exec(article)?.[1] ?? '',
      drg: /mb-card-drg(?!-not)/.test(article),
      cardImage:
        /background-image:\s*url\((https:\/\/www\.scouting\.org\/wp-content\/uploads\/[^)]+)\)/.exec(
          article,
        )?.[1] ?? null,
    })
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug))
}

// ---------------------------------------------------------------- badge page

/**
 * The patch is the only roughly-square image the page carries at badge size;
 * the rest are site chrome (wide logos, portrait pamphlet covers, letterbox
 * hero photos), none of which come close. Read the dimensions the CMS already
 * wrote into the tag rather than guessing from the filename, which is
 * inconsistent across badges.
 *
 * Three details the obvious version gets wrong, all found by surveying every
 * page rather than the first one:
 *
 * - Most patches are 240x240, but some were cropped a pixel or two off
 *   (Archaeology is 228x227), so the test is near-square, not square.
 * - Sizes run from 228 to 1500 square, so there is no useful upper bound —
 *   capping at 600 silently dropped Fishing (1200x1151).
 * - The patch always precedes the pamphlet cover, which is itself near-square
 *   on some badges. Taking the FIRST match is what separates them; the
 *   filename guard below is belt-and-braces.
 *
 * First-match also rules out later near-square photos in the body copy —
 * Camping carries a 636x615 rain poncho.
 */
function findPatchImage(html: string): string | null {
  const re =
    /<img\b[^>]*?\bwidth="(\d+)"[^>]*?\bheight="(\d+)"[^>]*?\bsrc="(https:\/\/www\.scouting\.org\/wp-content\/uploads\/[^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const [w, h] = [Number(m[1]), Number(m[2])]
    const nearSquare = Math.abs(w - h) <= Math.max(w, h) * 0.05
    if (nearSquare && w >= 120 && !/logo|pamphlet/i.test(m[3])) return m[3]
  }
  return null
}

interface RawNode {
  id: string
  parentId: string | null
  label: string
  text: string
  resources: Array<Resource>
}

function parseRequirements(html: string): {
  requirements: Array<ScrapedRequirement>
  notes: Array<string>
} {
  const start = html.indexOf('<div class="mb-requirement-container">')
  if (start === -1) return { requirements: [], notes: [] }
  const container = html.slice(start)

  const nodes: Array<RawNode> = []
  const notes: Array<string> = []

  // Top-level items: a numbered heading div, optionally followed by a <ul> of
  // descendants. The heading holds no nested divs, so its own closing tag ends
  // it — and that also terminates the last item, which has no sibling after it.
  const parentRe =
    /<div class="mb-requirement-parent mb-requirement-id-(\d+)">([\s\S]*?)(?=<ul class='mb-requirement-children-list'>|<\/div>)/g
  let pm: RegExpExecArray | null
  while ((pm = parentRe.exec(container))) {
    const [, id, body] = pm
    const numberMatch =
      /<span class='mb-requirement-listnumber'>([\s\S]*?)<\/span>/.exec(body)
    // Four badges drop the period off one top-level marker in the source
    // ("10" on Fishing, "4" on Multisport). Left as-is that line carries no
    // marker in the text form, so the parser reads it as wrapped prose and
    // welds the requirement onto the one above. Restore the period the rest
    // of the list already agrees on.
    const label = toPlainText(numberMatch?.[1] ?? '').replace(/^(\d+)$/, '$1.')
    const rest = numberMatch
      ? body.slice(numberMatch.index + numberMatch[0].length)
      : body
    const { text, resources } = splitResources(rest)
    if (!label) {
      // The unnumbered lead-in ("NOTE: pamphlets are free…") is page furniture,
      // not a requirement — keep it, but out of the tree.
      if (text) notes.push(text)
      continue
    }
    nodes.push({ id, parentId: null, label, text, resources })
  }

  const childRe =
    /<li class='mb-requirement-child mb-parent-(\d+) mb-requirement-id-(\d+)'>([\s\S]*?)<\/li>/g
  let cm: RegExpExecArray | null
  while ((cm = childRe.exec(container))) {
    const [, parentId, id, body] = cm
    // Only a real marker, and only when whitespace follows it — otherwise a
    // requirement opening on "St. Louis" would donate its abbreviation.
    const markerMatch =
      /^(\((?:\d{1,2}|[a-z]{1,3})\)|(?:\d{1,2}|[a-z])\.)\s/.exec(
        body.replace(/^\s+/, ''),
      )
    const label = markerMatch ? markerMatch[1] : ''
    const rest = label ? body.replace(/^\s*/, '').slice(label.length) : body
    const { text, resources } = splitResources(rest)
    nodes.push({ id, parentId, label, text, resources })
  }

  // Rebuild the tree from the parent pointers. Children of children live in the
  // same flat <ul>, so this is the only thing that recovers depth.
  const byId = new Map<string, ScrapedRequirement>()
  for (const n of nodes) {
    byId.set(n.id, {
      label: n.label,
      text: n.text,
      resources: n.resources,
      children: [],
    })
  }
  const roots: Array<ScrapedRequirement> = []
  for (const n of nodes) {
    const node = byId.get(n.id)!
    const parent = n.parentId ? byId.get(n.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return { requirements: roots, notes }
}

function toIndentedText(nodes: Array<ScrapedRequirement>, depth = 0): string {
  return nodes
    .map(
      (n) =>
        // Unlabelled rows ("Option A—…") would otherwise emit a stray leading
        // space and knock the indent off by one.
        `${'  '.repeat(depth)}${[n.label, n.text].filter(Boolean).join(' ')}`.trimEnd() +
        (n.children.length ? `\n${toIndentedText(n.children, depth + 1)}` : ''),
    )
    .join('\n')
}

function findPdfs(html: string): Badge['pdfs'] {
  const urls = [
    ...new Set(
      [
        ...html.matchAll(
          /https:\/\/filestore\.scouting\.org\/[^"'\s<>]+\.pdf/gi,
        ),
      ].map((m) => decodeEntities(m[0])),
    ),
  ]
  return {
    requirements: urls.filter((u) => !/\/Pamphlets\//i.test(u)),
    pamphlet: urls.filter((u) => /\/Pamphlets\//i.test(u)),
  }
}

// ---------------------------------------------------------------- main

async function main() {
  for (const dir of [DATA, HTML_DIR, IMG_DIR, BADGE_DIR])
    await mkdir(dir, { recursive: true })

  const indexFile = path.join(HTML_DIR, '_index.html')
  const index = await cachedPage(INDEX_URL, indexFile)
  if (!index)
    throw new Error(
      `no cached index at ${indexFile}; run without --extract first`,
    )
  const indexHtml = index.html
  if (index.fetched) await sleep(DELAY_MS)

  const entries = parseIndex(indexHtml)
  console.log(`index: ${entries.length} badges`)

  const badges: Array<Badge> = []
  const problems: Array<string> = []

  for (const [i, entry] of entries.entries()) {
    const pageFile = path.join(HTML_DIR, `${entry.slug}.html`)
    let page: { html: string; fetched: boolean } | null
    try {
      page = await cachedPage(entry.url, pageFile)
    } catch (err) {
      problems.push(
        `${entry.slug}: page fetch failed — ${(err as Error).message}`,
      )
      continue
    }
    if (!page) continue // --extract with nothing cached for this badge yet

    const { requirements, notes } = parseRequirements(page.html)
    const patchImage = findPatchImage(page.html)

    let patchFile: string | null = null
    if (patchImage) {
      const ext = path.extname(new URL(patchImage).pathname) || '.png'
      const dest = path.join(IMG_DIR, `${entry.slug}${ext}`)
      try {
        if (await downloadImage(patchImage, dest)) await sleep(1_000)
        patchFile = path.relative(DATA, dest)
      } catch (err) {
        problems.push(`${entry.slug}: image failed — ${(err as Error).message}`)
      }
    } else {
      problems.push(`${entry.slug}: no patch image found`)
    }
    if (requirements.length === 0)
      problems.push(`${entry.slug}: no requirements parsed`)

    const badge: Badge = {
      ...entry,
      patchImage,
      patchFile,
      notes,
      pdfs: findPdfs(page.html),
      requirements,
      requirementsText: toIndentedText(requirements),
      scrapedAt: new Date().toISOString(),
    }
    badges.push(badge)
    await writeFile(
      path.join(BADGE_DIR, `${entry.slug}.json`),
      `${JSON.stringify(badge, null, 2)}\n`,
    )

    console.log(
      `[${i + 1}/${entries.length}] ${entry.slug} — ${requirements.length} reqs` +
        (page.fetched ? '' : ' (cached)'),
    )
    if (page.fetched) await sleep(DELAY_MS)
  }

  await writeFile(
    path.join(DATA, 'badges.json'),
    `${JSON.stringify(
      badges.map(({ requirements: _r, requirementsText: _t, ...rest }) => rest),
      null,
      2,
    )}\n`,
  )

  console.log(
    `\nwrote ${badges.length} badges to ${path.relative(ROOT, BADGE_DIR)}`,
  )
  console.log(`images: ${(await readdir(IMG_DIR)).length}`)
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`)
    for (const p of problems) console.log(`  - ${p}`)
  }
}

await main()
