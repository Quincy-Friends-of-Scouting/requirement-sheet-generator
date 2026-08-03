import { Suspense, lazy } from 'react'
import {
  ClientOnly,
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { AuthMenu, AuthProvider } from '../lib/auth'

import appCss from '../styles.css?url'

/**
 * Devtools are dev-only and client-only, and must be reached through a dynamic
 * import behind `import.meta.env.DEV`.
 *
 * A static import puts `@tanstack/devtools` in the production SSR bundle, where
 * its solid-primitives dependency throws "Client-only API called on the server
 * side" the moment the module is evaluated — which 500s every request, not just
 * the ones that would render a panel. Dead-code elimination drops this branch
 * from the production build entirely; `ClientOnly` keeps the import from being
 * evaluated during SSR in dev.
 */
const Devtools = import.meta.env.DEV
  ? lazy(async () => {
      const [{ TanStackDevtools }, { TanStackRouterDevtoolsPanel }] =
        await Promise.all([
          import('@tanstack/react-devtools'),
          import('@tanstack/react-router-devtools'),
        ])

      return {
        default: () => (
          <TanStackDevtools
            config={{ position: 'bottom-right' }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        ),
      }
    })
  : null

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Requirement Sheet Generator' },
      {
        name: 'description',
        content:
          'Turn a list of merit badge requirements into a printable one-page counselor sign-off sheet.',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <html lang="en">
        <head>
          <HeadContent />
        </head>
        <body className="bg-stone-50 text-stone-900 antialiased">
          <header className="border-b border-stone-200 bg-white">
            <div className="mx-auto flex max-w-350 items-center justify-between gap-4 px-4 py-3">
              <Link to="/" className="font-semibold">
                Requirement Sheet Generator
              </Link>
              <div className="flex items-center gap-3 text-sm">
                <AuthMenu />
              </div>
            </div>
          </header>

          {children}

          {Devtools ? (
            <ClientOnly fallback={null}>
              <Suspense fallback={null}>
                <Devtools />
              </Suspense>
            </ClientOnly>
          ) : null}
          <Scripts />
        </body>
      </html>
    </AuthProvider>
  )
}
