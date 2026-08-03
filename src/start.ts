import { createStart } from '@tanstack/react-start'
import { clerkMiddleware } from '@clerk/tanstack-react-start/server'

/**
 * Clerk's middleware populates the request-scoped session that `auth()` reads
 * inside server functions. It is registered only when keys are present so the
 * app still boots for someone who just cloned the repo — the AI server
 * function refuses on its own in that case (see src/server/simplify.ts).
 */
const clerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY,
)

export const startInstance = createStart(() => ({
  requestMiddleware: clerkConfigured ? [clerkMiddleware()] : [],
}))
