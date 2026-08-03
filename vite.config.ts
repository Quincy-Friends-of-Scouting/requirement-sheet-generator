import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    // TanStack Start builds its server through Nitro. The AWS Amplify Hosting
    // target is Nitro's `aws_amplify` preset, which emits the `.amplify-hosting/`
    // bundle (compute/default + static + deploy-manifest.json) that Amplify's
    // WEB_COMPUTE platform expects. Nitro 3 is still nightly upstream, so the
    // dependency is pinned to an exact build rather than tracking `latest`,
    // which changes daily.
    nitro({
      preset: 'aws_amplify',
      compatibilityDate: '2026-07-09',
      awsAmplify: {
        runtime: 'nodejs24.x',
      },
      // Server-only private config, baked from the BUILD environment because
      // Amplify's compute runtime never sees env vars. Hydrated into
      // process.env at startup by the plugin below. Never use Vite `define`
      // for these — that would string-replace them into the client bundle too.
      runtimeConfig: {
        clerkSecretKey: process.env.CLERK_SECRET_KEY ?? '',
        anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
      },
      plugins: ['./src/server/env.ts'],
    }),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
