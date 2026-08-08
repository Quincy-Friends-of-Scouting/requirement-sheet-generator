import Anthropic from '@anthropic-ai/sdk'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import { z } from 'zod'
import {
  parseRequirements,
  requirementJsonSchema,
  requirementListSchema,
  stripAnnotations,
  withIds,
} from '../lib/requirements'
import type { Requirement } from '../lib/requirements'

/**
 * Turns pasted requirement text into the requirement tree, condensing each
 * item to a single sentence that fits one line of the sheet.
 *
 * Haiku 4.5 is deliberate here: this is a mechanical rewrite of text the user
 * already supplies, so it is the cheapest model that does the job well, and
 * structured outputs guarantee the response parses.
 */

const MODEL = 'claude-haiku-4-5'

/**
 * The rule set is shared with the batch pass — see `scripts/simplify-prompt.md`,
 * which carries the same three rules plus the evidence behind them. Only the
 * protocol differs: there the model answers a numbered worksheet, here it
 * returns the tree as structured output. Change one, change both.
 *
 * **The order is load-bearing.** Rules 1 and 2 are constraints; 3 is a goal
 * pursued only within them. An earlier version led with "under 110 characters"
 * and listed the specifics fourth — and the model duly shed counts, dropped
 * cross-references, and lowercased the ALL-CAPS words that mark a counted
 * choice, because it optimised what it was told first. Do not reorder these.
 */
const SYSTEM = `You reformat Scouting America merit badge requirements so they fit on a one-page counselor sign-off sheet.

You are given the official requirement text. Return the same requirements, restructured as a tree and condensed. The rules are ordered: 1 and 2 are hard constraints, 3 is a goal pursued only within them.

1. WHAT MUST SURVIVE. These are official requirements a Scout is graded against, so a line that loses one of these has changed the requirement, not shortened it.
- Every specific: counts, durations, distances, measurements, scores, named items. "six of the 15 varieties" must not become "several varieties". A spelled-out number may become a digit; it must not vanish.
- Cross-references to other requirements, by number. They read like filler and are not: they say WHICH thing. "Pick ONE of the sites you surveyed in requirement 4(a)" must not become "Pick ONE" - nobody can tell which site. Abbreviate instead: "Pick ONE of the sites from 4(a)".
- ALL-CAPS emphasis exactly as capitalized: ONE, TWO, THREE, ALL, EACH, NOT. Lowercasing "discuss TWO of the following" turns a counted choice the counselor ticks into ordinary description.
- Official terminology and proper nouns, as written.
- Choice structure: keep "Do ONE of the following" and "Do ALL of the following" lead-ins on the parent item, and write "OR" in capitals between alternatives.
Only one thing is safe to drop: a parenthetical restatement of a value in another unit, so "a 40-centimeter (16-inch) target" may become "a 40-centimeter target". Never drop the primary value.

2. KEEP EVERY REQUIREMENT, IN PLACE. Preserve every requirement and sub-requirement, the original order, and the original numbering. Put the marker ("1.", "a.", "(1)") in "label" and the prose in "text".
- Never merge two requirements into one, never drop one, never invent one, never reorder.
- A bare lead-in such as "Do the following:" is itself a requirement and keeps its own node. Swallowing it into the item below shifts everything after it out of step, which looks correct and is not.
- A parent keeps only its lead-in; its detail belongs to its children.
- Reading material ("Resource: ...", "See also ...", a bare link) is not a requirement - leave it out. A numbered requirement that happens to be ABOUT resources is a requirement and must be kept.

3. SHORTEN, within rules 1 and 2. Condense each requirement to ONE sentence, ideally under 110 characters, so it fits a single printed line.
- If you cannot fit it without breaking rule 1, let the line run long. A requirement that wraps onto a second line is fine; a requirement that lost its count is not.
- Do not compress by merging requirements. How many rows fit on the page is decided elsewhere; your unit of work is the single requirement.
- Drop filler like "with your counselor" only when it does not change what the Scout must do.
- If a requirement is already short, keep it unchanged.
- Use plain ASCII punctuation.`

const inputSchema = z.object({
  text: z.string().min(1).max(20_000),
  badgeName: z.string().max(120).optional(),
})

export interface SimplifyResult {
  requirements: Array<Requirement>
  /** True when the model was unavailable and the deterministic parser ran. */
  fallback: boolean
  note?: string
}

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set on the server. Add it to .env and restart.',
    )
  }
  return new Anthropic({ apiKey })
}

export const simplifyRequirements = createServerFn({ method: 'POST' })
  .validator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<SimplifyResult> => {
    // Hard gate: this call spends the operator's Anthropic key, so it never
    // runs unauthenticated — including when Clerk is not configured at all.
    if (!process.env.CLERK_SECRET_KEY) {
      throw new Error(
        'Auth is not configured on the server, so AI simplification is disabled. Set CLERK_SECRET_KEY and VITE_CLERK_PUBLISHABLE_KEY.',
      )
    }

    const { userId } = await auth()
    if (!userId) {
      throw new Error('Sign in to use requirement simplification.')
    }

    const anthropic = client()

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: {
        format: {
          type: 'json_schema',
          schema: requirementJsonSchema(3),
        },
      },
      messages: [
        {
          role: 'user',
          content: [
            data.badgeName ? `Merit badge: ${data.badgeName}` : null,
            'Requirements:',
            // "Resource: <title> (video)" links are removed here rather than
            // left to the prompt: the model cannot keep what it never sees, and
            // it is the same pass the no-AI parser runs, so both paths agree.
            stripAnnotations(data.text),
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      throw new Error(
        'The model declined to process this text. Check that the input is merit badge requirements.',
      )
    }

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock) {
      throw new Error('The model returned no text to parse.')
    }

    const parsed = z
      .object({ requirements: requirementListSchema })
      .parse(JSON.parse(textBlock.text))

    return {
      requirements: withIds(parsed.requirements),
      fallback: false,
      note:
        response.stop_reason === 'max_tokens'
          ? 'Output hit the token limit — the tail of the list may be missing.'
          : undefined,
    }
  })

/**
 * Local, free path. Recovers structure from the numbering markers without
 * touching the wording, so it works offline and costs nothing.
 */
export function parseWithoutAI(text: string): SimplifyResult {
  return { requirements: parseRequirements(text), fallback: true }
}
