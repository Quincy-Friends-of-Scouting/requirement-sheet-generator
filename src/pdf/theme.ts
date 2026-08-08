import { Font, StyleSheet } from '@react-pdf/renderer'

/** Wrap on whole words only — a mid-word hyphen on the poster title reads badly. */
Font.registerHyphenationCallback((word) => [word])

/**
 * Geometry ported from the original `sign.py`. reportlab worked in points
 * (72/inch) and so does @react-pdf/renderer, so the numbers carry over
 * directly: 0.5in margins, a 90/10 split between requirement text and the
 * initials column, and 30/5/30/5/30 for the signature-blank rows.
 */
export const INCH = 72
export const PAGE_WIDTH = 8.5 * INCH
export const MARGIN = 0.5 * INCH
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2

/** reportlab's `colors.HexColor("#80808080")` — the hairline under every row. */
export const HAIRLINE = '#c0c0c0'
export const RULE = '#000000'

/** Sub-requirements step in by 0.15in per level, as in the original. */
export const INDENT_STEP = 0.15 * INCH

export const styles = StyleSheet.create({
  page: {
    paddingTop: MARGIN,
    paddingBottom: MARGIN,
    paddingLeft: MARGIN,
    paddingRight: MARGIN,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#000000',
  },

  watermark: {
    position: 'absolute',
    objectFit: 'contain',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerImage: {
    width: 1.5 * INCH,
    height: 1.5 * INCH,
    objectFit: 'contain',
  },
  headerImageSlot: {
    width: CONTENT_WIDTH * 0.25,
  },
  headerTitle: {
    width: CONTENT_WIDTH * 0.75,
    fontFamily: 'Helvetica-Bold',
    fontSize: 40,
    textAlign: 'center',
  },

  fieldRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  fieldBlank: {
    width: CONTENT_WIDTH * 0.3,
  },
  fieldGutter: {
    width: CONTENT_WIDTH * 0.05,
  },
  fieldRule: {
    height: 18,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  fieldLabel: {
    fontSize: 10,
    paddingTop: 2,
  },

  requirementRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 3,
    borderBottomWidth: 0.25,
    borderBottomColor: HAIRLINE,
  },
  requirementText: {
    width: CONTENT_WIDTH * 0.9,
    fontSize: 10,
    lineHeight: 1.25,
    paddingRight: 6,
  },
  initialsCell: {
    width: CONTENT_WIDTH * 0.1,
    height: 11,
  },
  initialsRule: {
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },

  completionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 14,
  },
  checkbox: {
    width: 0.2 * INCH,
    height: 0.2 * INCH,
    borderWidth: 1,
    borderColor: RULE,
    marginRight: 6,
  },
  completionLabel: {
    width: CONTENT_WIDTH * 0.45 - 0.2 * INCH - 6,
    fontSize: 10,
  },

  posterPage: {
    paddingTop: MARGIN,
    paddingBottom: MARGIN,
    paddingLeft: MARGIN,
    paddingRight: MARGIN,
    fontFamily: 'Helvetica',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 70,
    lineHeight: 1,
    textAlign: 'center',
    marginBottom: 20,
  },
  posterImage: {
    width: 5.25 * INCH,
    height: 5.25 * INCH,
    objectFit: 'contain',
  },
})
