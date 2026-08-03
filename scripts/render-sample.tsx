/**
 * Smoke test for the PDF layout: renders the Genealogy sheet and table sign
 * from the legacy assets so you can eyeball the port against
 * `legacy/output/genealogy.pdf` without booting the app.
 *
 *   pnpm render:sample [outDir]
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToFile } from '@react-pdf/renderer'
import { BadgePoster, RequirementSheet } from '../src/pdf/RequirementSheet'
import { parseRequirements } from '../src/lib/parse'
import { DEFAULT_SHEET } from '../src/lib/sheet'
import { countNodes } from '../src/lib/requirements'
import type { DocumentProps } from '@react-pdf/renderer'

const SOURCE = `1. Do the following:
a. Explain to your counselor what the words genealogy, ancestor, and descendant mean.
b. Explain what a family tree is and what information would be kept there.
c. Explain what a family group record is and what information would be kept there.
2. Do ONE of the following:
a. Create a time line for yourself or a relative, then write a short biography from it.
b. Keep a journal for six weeks. You must write in it at least once a week.
3. With a parent or guardian's help, interview a relative in person, by phone, or by letter, and record what you collect.
4. Do the following:
a. Name three types of physical genealogical resources and where to find them.
b. Name three types of digital genealogical resources and where to find them.
c. Obtain at least one genealogical document supporting an event on your pedigree chart.
d. Tell how you found it and how you would evaluate the information in 4c.
e. Tell a likely place to find marriage, census, birth, and burial records.
5. Contact ONE of the following and report the results:
a. A genealogical or lineage society
b. A professional genealogist
c. A surname organization, such as your family's organization
d. A genealogical educational facility or institution
e. A genealogical record repository of any type
6. Begin your family tree, listing yourself plus at least two more generations.
7. Complete a family group record form listing yourself and your siblings as the children.
8. Do the following:
a. Explain the effect computers and the Internet are having on genealogy.
b. Explain how photography has influenced genealogy.
c. Explain how record indexing works and how it has influenced genealogy.
9. Discuss what you have learned about your family through your research.`

function dataUrl(path: string, mime: string) {
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`
}

async function main() {
  const outDir = process.argv[2] ?? 'sample-output'
  mkdirSync(outDir, { recursive: true })

  const requirements = parseRequirements(SOURCE)
  const spec = {
    ...DEFAULT_SHEET,
    badgeName: 'Genealogy',
    requirements,
    // PNG on purpose: @react-pdf/renderer takes PNG and JPEG only. In the app
    // the browser re-encodes every upload to PNG (see components/ImageDrop),
    // so WebP badge art works there; this script has no canvas to do that.
    badgeImage: {
      name: 'OutdoorEthics.png',
      dataUrl: dataUrl('legacy/assets/OutdoorEthics.png', 'image/png'),
    },
    watermark: {
      name: 'aa-logo.jpeg',
      dataUrl: dataUrl('legacy/assets/aa-logo.jpeg', 'image/jpeg'),
    },
  }

  console.log(
    `parsed ${requirements.length} top-level items, ${countNodes(requirements)} rows total`,
  )

  await renderToFile(
    createElement(RequirementSheet, {
      spec,
    }) as React.ReactElement<DocumentProps>,
    `${outDir}/genealogy.pdf`,
  )
  await renderToFile(
    createElement(BadgePoster, { spec }) as React.ReactElement<DocumentProps>,
    `${outDir}/genealogy-sign.pdf`,
  )

  console.log(`wrote ${outDir}/genealogy.pdf and ${outDir}/genealogy-sign.pdf`)
}

await main()
