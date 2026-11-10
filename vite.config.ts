import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus';

// Vite+ drives lint (Oxlint), format (Oxfmt) and unit tests (Vitest). The app itself
// is still built and served by Next.js, so `build` and `dev` stay `next` scripts.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/unit/**/*.spec.ts'],
    environment: 'node',
    // Playwright gave every test 30s; the PDF, image and crypto specs rely on it.
    testTimeout: 30_000,
  },
  staged: {
    '*': 'vp check --fix',
  },
  lint: {
    plugins: ['oxc', 'typescript', 'unicorn', 'react', 'nextjs', 'jsx-a11y', 'import'],
    categories: {
      correctness: 'error',
    },
    env: {
      builtin: true,
      browser: true,
    },
    ignorePatterns: ['.next/**', 'out/**', 'src-tauri/target/**', 'next-env.d.ts'],
    rules: {
      'no-array-constructor': 'error',
      'no-unused-expressions': 'error',
      'no-unused-vars': 'error',
      'typescript/ban-ts-comment': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/no-require-imports': 'error',
      'typescript/prefer-as-const': 'error',
      'typescript/no-non-null-asserted-optional-chain': 'error',
      'typescript/triple-slash-reference': 'error',
      'react/display-name': 'error',
      'react/jsx-key': 'error',
      'react/jsx-no-comment-textnodes': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-undef': 'error',
      'react/no-children-prop': 'error',
      'react/no-danger-with-children': 'error',
      'react/no-direct-mutation-state': 'error',
      'react/no-unescaped-entities': 'error',
      'react/rules-of-hooks': 'error',
      'react/exhaustive-deps': 'warn',
      'nextjs/no-html-link-for-pages': 'error',
      'nextjs/no-sync-scripts': 'error',
      'nextjs/no-assign-module-variable': 'error',
      'nextjs/no-duplicate-head': 'error',
      // Every <img> shows a blob: or data: URL made from the user's own file.
      // next/image cannot optimise those, and the static export has it disabled anyway.
      'nextjs/no-img-element': 'off',
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
    overrides: [
      {
        // Node scripts run by CI are CommonJS.
        files: ['scripts/**/*.js'],
        env: { node: true },
        rules: { 'typescript/no-require-imports': 'off' },
      },
      {
        // The service worker runs in a worker scope, not a window.
        files: ['public/sw.js'],
        env: { serviceworker: true },
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    useTabs: false,
    trailingComma: 'es5',
    printWidth: 100,
    sortPackageJson: false,
    ignorePatterns: [
      '.next/**',
      'out/**',
      'src-tauri/target/**',
      'src-tauri/gen/**',
      'next-env.d.ts',
      'pnpm-lock.yaml',
    ],
  },
});
