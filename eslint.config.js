//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // `.amplify-hosting` is the Nitro build output for AWS Amplify — generated
    // JS with no tsconfig project, so the typed linter errors on every file.
    ignores: [
      'eslint.config.js',
      'prettier.config.js',
      '.amplify-hosting/**',
      'dist/**',
    ],
  },
]
