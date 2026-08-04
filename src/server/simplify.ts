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

const SYSTEM = `You reformat Scouting America merit badge requirements so they fit on a one-page counselor sign-off sheet.

You are given the official requirement text. Return the same requirements, restructured as a tree and condensed.

Rules:
- Preserve every requirement and every sub-requirement. Never merge two requirements into one, never drop one, and never invent one.
- Preserve the original order and the original numbering. Put the marker ("1.", "a.", "(1)") in "label" and the prose in "text".
- Condense each requirement to ONE sentence, ideally under 110 characters, so it fits on a single printed line.
- Preserve meaning exactly. These are official requirements a Scout is graded against: keep every specific number, count, duration, and named item ("eight species", "six weeks", "Leave No Trace").
- Keep official terminology and proper nouns as written.
- Write "OR" in capitals when the Scout chooses between alternatives, and keep "Do ONE of the following" style headers on the parent item.
- A parent item keeps only its lead-in text (e.g. "Do the following:"); its detail belongs in its children.
- Reading material attached to a requirement ("Resource: ...", "See also ...", a bare link) is not a requirement. Leave it out. A numbered requirement that happens to be about resources is a requirement and must be kept.
- Drop filler like "with your counselor" only when it does not change what the Scout must do.
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
