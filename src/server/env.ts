import { useRuntimeConfig } from 'nitro/runtime-config'

/**
 * Nitro startup plugin — hydrates server secrets into `process.env`.
 *
 * Amplify Hosting's SSR compute runtime does not receive branch environment
 * variables: they reach the BUILD only, and Nitro does not read `.env` in
 * production. Both secrets here are read lazily at request time — Clerk's SSR
 * middleware reads `CLERK_SECRET_KEY` per request, and `simplify.ts` reads
 * `ANTHROPIC_API_KEY` when a rewrite is asked for — so without this they are
 * `undefined` in production and every SSR request 500s with an opaque h3
 * `HTTPError` (h3 masks the real message when the throw is unhandled, so the
 * symptom gives no hint of the cause).
 *
 * The values arrive via Nitro's `runtimeConfig` (see vite.config.ts), which is
 * server-only — unlike Vite `define`, it is never bundled into client assets.
 *
 * Existing `process.env` values win, so a real environment (local dev, or any
 * host that does inject vars) is never overwritten by a stale baked-in value.
 */
export default () => {
  const config = useRuntimeConfig() as {
    clerkSecretKey?: string
    anthropicApiKey?: string
  }

  if (config.clerkSecretKey && !process.env.CLERK_SECRET_KEY) {
    process.env.CLERK_SECRET_KEY = config.clerkSecretKey
  }
  if (config.anthropicApiKey && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = config.anthropicApiKey
  }
}
