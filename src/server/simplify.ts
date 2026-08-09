import Anthropic from '@anthropic-ai/sdk'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import { condenseSystemPrompt } from 'requirement-tree/condense'
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
 * The rules themselves live in `requirement-tree/condense`, alongside the
 * schema they describe — the batch pass and the sign-off app read the same
 * text, so a counselor gets the same rewrite whichever produced it. What stays
 * here is only what is ours: what the sheet is for, and how wide it is.
 *
 * 110 characters is one printed line of the requirement column at the sheet's
 * body size. Changing the layout is what should change this number.
 */
const SYSTEM = condenseSystemPrompt({
  task: 'You reformat Scouting America merit badge requirements so they fit on a one-page counselor sign-off sheet.',
  maxChars: 110,
})

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
