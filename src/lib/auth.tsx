import {
  ClerkProvider,
  Show,
  SignInButton,
  UserButton,
} from '@clerk/tanstack-react-start'

/**
 * Thin wrapper so the app still runs with no Clerk keys configured.
 *
 * Auth exists to gate the AI feature (which spends the operator's Anthropic
 * key), not to gate the tool. Without keys, everything except "Shorten with
 * AI" keeps working and that one button explains what is missing — which
 * matters because `<ClerkProvider>` throws outright on a missing publishable
 * key and would otherwise take the whole page down.
 */
/**
 * Treat the `pk_test_...` placeholder from `.env.example` as "not configured".
 * Someone who copies the example file without editing it would otherwise hand
 * Clerk a bogus key, and it throws on those just as hard as on a missing one.
 */
export const clerkEnabled = (() => {
  const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
  return Boolean(key && key.startsWith('pk_') && !key.includes('...'))
})()

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!clerkEnabled) return <>{children}</>
  return <ClerkProvider>{children}</ClerkProvider>
}

/** Header slot: sign-in button, avatar, or a setup hint. */
export function AuthMenu() {
  if (!clerkEnabled) {
    return (
      <span className="text-xs text-stone-500">
        Auth not configured — AI features disabled
      </span>
    )
  }

  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button
            type="button"
            className="rounded-md bg-stone-800 px-3 py-1.5 text-white hover:bg-stone-700"
          >
            Sign in
          </button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </>
  )
}

/** Renders `children` only for a signed-in user; otherwise shows `fallback`. */
export function RequireSignIn({
  children,
  fallback,
  unconfigured,
}: {
  children: React.ReactNode
  fallback: React.ReactNode
  unconfigured: React.ReactNode
}) {
  if (!clerkEnabled) return <>{unconfigured}</>
  return (
    <Show when="signed-in" fallback={fallback}>
      {children}
    </Show>
  )
}
