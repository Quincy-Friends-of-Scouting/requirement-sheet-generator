import type { Requirement } from './requirements'

/** One image as a data URL, plus the filename it came from (for the UI). */
export interface UploadedImage {
  name: string
  dataUrl: string
}

export interface SheetSpec {
  /** Printed large at the top of the sheet and the poster, verbatim. */
  badgeName: string
  badgeImage: UploadedImage | null
  /** Faint background mark — a troop or council logo. */
  watermark: UploadedImage | null
  watermarkOpacity: number
  requirements: Array<Requirement>
  scoutFields: [string, string, string]
  counselorFields: [string, string, string]
  showCompletionBoxes: boolean
}

export const DEFAULT_SHEET: SheetSpec = {
  badgeName: '',
  badgeImage: null,
  watermark: null,
  watermarkOpacity: 0.1,
  requirements: [],
  scoutFields: ['Scout Name', 'Scout Unit # and Town', 'Date'],
  counselorFields: [
    'Counselor Signature',
    'Counselor Name',
    'Counselor Contact',
  ],
  showCompletionBoxes: true,
}

/** `Genealogy` -> `genealogy`; used for the downloaded filenames. */
export function slugify(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'requirement-sheet'
  )
}
