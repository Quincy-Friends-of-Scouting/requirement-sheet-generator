import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import { CONTENT_WIDTH, INCH, INDENT_STEP, styles } from './theme'
import { flatten, getsSignatureLine } from '../lib/requirements'
import type { SheetSpec, UploadedImage } from '../lib/sheet'

/**
 * The one-page counselor sheet: badge header, scout identity blanks, one row
 * per requirement with a signature rule on every leaf, then the completion
 * checkboxes and counselor blanks.
 */

/** Where each page puts the watermark. The aspect ratio is the logo's, not a choice. */
const SHEET_WATERMARK = { right: 1 * INCH, width: 300, height: 265 }
const POSTER_WATERMARK = { right: 0.5 * INCH, width: 225, height: 199 }

/**
 * The faint logo behind a page.
 *
 * Takes the image and an opacity rather than the whole `SheetSpec` so the two
 * call sites can differ — the poster prints it three times stronger, since it
 * is read across a room rather than at arm's length.
 */
function Watermark({
  image,
  opacity,
  placement,
}: {
  image: UploadedImage | null
  opacity: number
  placement: { right: number; width: number; height: number }
}) {
  if (!image) return null
  return (
    <Image
      src={image.dataUrl}
      style={[styles.watermark, { opacity, bottom: 30, ...placement }]}
      fixed
    />
  )
}

/** Three underlined blanks with their captions beneath — scout and counselor. */
function SignatureFields({
  labels,
}: {
  labels: readonly [string, string, string]
}) {
  return (
    <View style={styles.fieldRow}>
      {labels.map((label, i) => (
        <View key={label + i} style={{ flexDirection: 'row' }}>
          {i > 0 ? <View style={styles.fieldGutter} /> : null}
          <View style={styles.fieldBlank}>
            <View style={styles.fieldRule} />
            <Text style={styles.fieldLabel}>{label}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function RequirementRow({
  depth,
  label,
  text,
  signable,
}: {
  depth: number
  label: string
  text: string
  signable: boolean
}) {
  const indent = depth * INDENT_STEP
  return (
    <View style={styles.requirementRow} wrap={false}>
      <View style={{ width: CONTENT_WIDTH * 0.9, paddingLeft: indent }}>
        <Text style={{ fontSize: 10, lineHeight: 1.25, paddingRight: 6 }}>
          {[label, text].filter(Boolean).join(' ')}
        </Text>
      </View>
      <View
        style={[
          styles.initialsCell,
          ...(signable ? [styles.initialsRule] : []),
        ]}
      />
    </View>
  )
}

/**
 * The pages are split out from their Documents so the "Both" view can put
 * them in a single PDF without duplicating any layout.
 */
function SheetPage({ spec }: { spec: SheetSpec }) {
  const rows = flatten(spec.requirements)

  return (
    <Page size="LETTER" style={styles.page}>
      <Watermark
        image={spec.watermark}
        opacity={spec.watermarkOpacity}
        placement={SHEET_WATERMARK}
      />

      <View style={styles.header}>
        <View style={styles.headerImageSlot}>
          {spec.badgeImage ? (
            <Image src={spec.badgeImage.dataUrl} style={styles.headerImage} />
          ) : null}
        </View>
        <Text style={styles.headerTitle}>{spec.badgeName}</Text>
      </View>

      <SignatureFields labels={spec.scoutFields} />

      {rows.map(({ requirement, depth }) => (
        <RequirementRow
          key={requirement.id}
          depth={depth}
          label={requirement.label}
          text={requirement.text}
          signable={getsSignatureLine(requirement)}
        />
      ))}

      {spec.showCompletionBoxes ? (
        <View style={styles.completionRow}>
          <View style={styles.checkbox} />
          <Text style={styles.completionLabel}>Merit Badge Complete</Text>
          <View style={styles.checkbox} />
          <Text style={styles.completionLabel}>Merit Badge Partial</Text>
        </View>
      ) : (
        <View style={{ height: 14 }} />
      )}

      <SignatureFields labels={spec.counselorFields} />
    </Page>
  )
}

/** The large single-page sign that sits on the table at a merit badge midway. */
function PosterPage({ spec }: { spec: SheetSpec }) {
  return (
    <Page size="LETTER" style={styles.posterPage}>
      <Watermark
        image={spec.watermark}
        opacity={Math.min(1, spec.watermarkOpacity * 3)}
        placement={POSTER_WATERMARK}
      />

      <Text style={styles.posterTitle}>{spec.badgeName}</Text>
      {spec.badgeImage ? (
        <Image src={spec.badgeImage.dataUrl} style={styles.posterImage} />
      ) : null}
    </Page>
  )
}

function docTitle(spec: SheetSpec) {
  return spec.badgeName || 'Requirement Sheet'
}

export function RequirementSheet({ spec }: { spec: SheetSpec }) {
  return (
    <Document title={docTitle(spec)}>
      <SheetPage spec={spec} />
    </Document>
  )
}

export function BadgePoster({ spec }: { spec: SheetSpec }) {
  return (
    <Document title={docTitle(spec)}>
      <PosterPage spec={spec} />
    </Document>
  )
}

/** Sheet and sign in one file — what you print to hand a counselor a full set. */
export function CombinedDocument({ spec }: { spec: SheetSpec }) {
  return (
    <Document title={docTitle(spec)}>
      <SheetPage spec={spec} />
      <PosterPage spec={spec} />
    </Document>
  )
}
