# Agent Guide

This guide is for coding agents working in this repository. It is grounded in the current docs and codebase structure.

## Project Snapshot

- Product: LazyTools, a privacy-first collection of browser-side web utilities, developer tools, and productivity helpers.
- Live site: `https://lazytools.dev/`.
- Main app: Next.js 16 App Router in `src/`.
- UI stack: React 19, TypeScript, Tailwind CSS v4, shadcn-style components, Lucide icons.
- Output model: static export. `next.config.mjs` sets `output: 'export'`, `images.unoptimized: true`, and `trailingSlash: true`.
- Desktop wrapper: Tauri v2 under `src-tauri/`, using `out/` as `frontendDist`.
- Privacy rule: tools should run locally in the browser or desktop webview. Do not send user content to servers unless the feature explicitly requires an external lookup API.

## Commands

- Install: `npm install`
- Dev server: `npm run dev`
- Production static build: `npm run build`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Fix lint: `npm run lint:fix`
- Format: `npm run format`
- E2E tests: `npm run test:e2e`
- E2E UI runner: `npm run test:e2e:ui`
- Install Playwright browsers: `npm run test:e2e:install`
- Bundle analysis: `npm run analyze`
- Desktop dev: `npm run desktop:dev`
- Desktop build: `npm run desktop:build`

For normal code changes, at minimum run `npm run typecheck` and the most relevant focused verification. Before considering a change complete, prefer `npm run build`; docs explicitly call this out as the completion gate.

## High-Value Docs

- `docs/README.md`: product overview, stack, setup, deployment.
- `docs/ARCHITECTURE.md`: rendering model, static export, route generation, tool wiring.
- `docs/CONTRIBUTING.md`: coding standards, new-tool workflow, UX rules, testing expectations.
- `docs/ROADMAP.md`: current priorities and tool expansion backlog.
- `docs/PROPOSED_BACKLOG.md`: detailed proposed tools, client-side implementation notes, library ideas.

## Core Architecture

- `src/app/layout.tsx` defines global metadata, font setup, theme flicker prevention, providers, header, footer, PWA registration, Tauri handling, and command palette.
- `src/app/page.tsx` renders the home page shell.
- `src/components/HomeContent.tsx` handles search, tag filtering, favorites filtering, session-state restoration, grouped tool cards, and compact-mode layout.
- `src/app/tools/[slug]/page.tsx` statically generates every tool route from `TOOLS`, generates per-tool metadata, loads the tool component, and wraps it in `ToolPageClient`.
- `src/components/ToolPageClient.tsx` handles the tool page header, favorite button, full-width setting, and recent-tool tracking.
- `src/lib/utils/tool-registry.ts` is the source of truth for tool IDs, names, descriptions, tags, icons, keywords, hidden/featured flags, and lazy component loaders.
- `src/lib/utils/tools-config.ts` derives `TOOLS` and `TAGS`, search scoring, filtering, and helpers from the registry.
- `src/lib/types.ts` defines shared tool, tag, settings, and filter types.
- `src/lib/contexts/*` stores theme, settings, favorites, recents, and command-palette state.
- `src/lib/utils/storage.ts` wraps browser `localStorage` with SSR-safe helpers and the `dev-toolbox:*` key namespace.
- `src/components/ui/*` contains shadcn-style primitives. Avoid editing these for page-level layout fixes.
- `src/components/tools/*` contains individual client-side tool implementations.

## Tool Registry Rules

- Add or edit tool metadata in `src/lib/utils/tool-registry.ts` first.
- Each registry key is the route slug, for example `/tools/json-formatter` comes from `json-formatter`.
- Each entry must include display metadata and a lazy component loader.
- Description length is enforced at module load: 40 to 65 characters inclusive.
- `hidden: true` keeps a route available but hides it from normal lists and search results.
- `TOOLS` is derived from the registry; do not duplicate tool metadata elsewhere.
- `src/app/tools/[slug]/page.tsx`, sitemap generation, home search/filtering, route coverage tests, and service-worker precache generation all depend on the registry.

## Adding A Tool

1. Create a client component under `src/components/tools/ExampleTool.tsx` with `'use client';` if it uses browser APIs, state, effects, or event handlers.
2. Export a named component matching the registry import, for example `export function ExampleTool()`.
3. Add a registry entry in `src/lib/utils/tool-registry.ts` with slug, name, 40-65 character description, tags, icon, keywords, and `component` dynamic import.
4. Use existing primitives from `src/components/ui` before adding new UI primitives.
5. Keep browser-only APIs inside client components, effects, or event handlers.
6. Lazy-load heavy libraries inside the tool when practical, especially PDF, image, crypto, OCR, parser, or export dependencies.
7. Verify `/tools/<slug>` in dev, home search, tag filtering, favorites, recents, and command palette navigation.
8. Run `npm run typecheck` and `npm run build`; add or run Playwright tests for core flows or route behavior when relevant.

## UI And UX Conventions

- Preserve the existing visual language: card-based tool pages, Tailwind utility classes, shadcn-style primitives, Lucide icons, dark mode.
- Always use the UI components in `src/components/ui/` (e.g., `Select`, `Slider`, `Switch`, `Checkbox`, `Input`, `Button`, `ColorPicker`) instead of browser native inputs (like `<select>`, `<input type="range">`, `<input type="checkbox">`, `<input type="color">`). If a Shadcn UI primitive is needed but doesn't exist, add it to the project rather than using native browser fallbacks.
- Ensure all custom interactive dropdowns, select menus, search palettes, and key-navigable lists support full keyboard accessibility. Users must be able to use `ArrowUp` and `ArrowDown` to change highlights, and `Enter`/`Space` to select values. Highlight states must match programmatic focus where appropriate.
- Avoid styling overrides using hardcoded colors (e.g. `bg-blue-500` or `text-slate-900`) for standard elements. Always prefer Tailwind theme variables and semantic classes (`bg-accent`, `text-accent-foreground`, `border-input`, `text-muted-foreground`, etc.) to guarantee seamless light/dark mode compatibility.
- Always use the common ColorPicker component (`@/components/ui/color-picker`) when color selection is needed, rather than browser native inputs or custom color fields (unless building a dedicated color picker page).
- Mobile is the default. Add larger layouts at `sm`, `md`, and up.
- Keep tool pages compact on phones. Prefer roughly `p-4` mobile card padding unless the workflow needs more space.
- Avoid horizontal overflow. Action rows should wrap or stack on small screens.
- Avoid nested full cards unless the grouping genuinely needs it; prefer lighter bordered panels inside cards.
- Use real-time processing for lightweight converters, encoders, formatters, and text transforms.
- Use explicit buttons for expensive work: file uploads, image/PDF processing, crypto/key generation, network lookups, and exports.
- Provide clear empty, error, loading, and success states where applicable.
- Include copy and clear actions for user-facing text output.
- Preserve light mode, dark mode, compact mode, full-width mode, mobile, and desktop behavior.

## Static Export Constraints

- Do not add request-time server rendering assumptions.
- Keep route data static-safe.
- Dynamic tool routes must be generated through `TOOLS` and `generateStaticParams()`.
- Do not add server-only APIs, Node-only runtime dependencies in browser paths, or Next features that break `output: 'export'`.
- External lookup tools must call public CORS-enabled HTTPS APIs from the browser and handle failures gracefully.
- Next image optimization is disabled for static export; use compatible image patterns.

## State And Persistence

- Theme, favorites, recent tools, compact mode, full-width mode, and per-tool settings use `localStorage` through `src/lib/utils/storage.ts`.
- Home search/filter/scroll restoration uses `sessionStorage` in `HomeContent`.
- Theme initialization is intentionally duplicated early in `layout.tsx` to prevent flicker before hydration.
- Always guard direct browser storage, DOM, window, navigator, clipboard, canvas, file, audio, and crypto APIs behind client-only execution.

## PWA And Service Worker

- `public/sw.js` implements static asset caching, route precache loading, network-first navigation, and stale-while-revalidate static assets.
- `scripts/generate-sw-precache.js` runs after `next build` and writes `public/sw-precache.js` from registry slugs.
- If tool routes change, `npm run build` regenerates the precache list.
- Avoid hand-editing generated `public/sw-precache.js` unless intentionally changing generated output.

## Desktop And Release

- Tauri config lives in `src-tauri/tauri.conf.json`.
- Desktop dev uses `devUrl: http://localhost:3000` and `beforeDevCommand: npm run dev`.
- Desktop build uses `beforeBuildCommand: npm run build` and packages `../out`.
- Release workflow `.github/workflows/release-desktop.yml` runs on `v*` tags, syncs versions, builds web assets, builds Tauri installers, and drafts a GitHub release.
- `scripts/sync-version.js` updates `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` from a tag/version argument.

## Testing

- Playwright config is in `playwright.config.ts`.
- Tests run against `http://localhost:3000` and start `npm run dev` automatically.
- Projects cover Chromium, Firefox, and WebKit; route coverage skips non-Chromium for speed.
- `playwright/route-coverage.spec.ts` iterates every `TOOLS` entry and verifies each tool page renders.
- `playwright/smoke.spec.ts` covers search, favorites, command palette navigation, and JSON Formatter behavior.
- For UI changes, manually verify mobile and desktop widths, light/dark mode, compact mode, and full-width mode when affected.

## Code Style

- TypeScript is strict; avoid `any` unless a dynamic API genuinely requires it.
- Use the `@/*` path aliases from `tsconfig.json`.
- React components are function components with hooks.
- ESLint extends Next core web vitals and TypeScript configs, with React hooks immutability, purity, and set-state-in-effect as warnings.
- Keep changes focused. Prefer the smallest correct change over broad refactors.
- Do not edit generated/build output such as `.next/`, `out/`, `tsconfig.tsbuildinfo`, Playwright reports, or Tauri `target/` unless explicitly requested.
- Do not include unrelated generated files in commits or PRs.

## Common Pitfalls

- Registry description length outside 40-65 characters will throw at import/build time.
- Missing or mismatched named exports in tool components are caught by typecheck/build through lazy component loaders.
- Hidden tools still generate routes because `generateStaticParams()` maps all `TOOLS` entries.
- Client tools can be statically routed, but interactive logic must hydrate in client components.
- Browser APIs used during render or in server components will break static/server execution.
- PWA service workers can create stale behavior during local testing; Playwright blocks service workers by default.

## Agent Workflow

1. Read the relevant docs before changing behavior: start with `docs/ARCHITECTURE.md` and `docs/CONTRIBUTING.md`.
2. Locate the source of truth before editing. For tools, start in `tool-registry.ts`, `tools-config.ts`, and the relevant `src/components/tools/*` file.
3. Keep privacy-first and static-export compatibility as non-negotiable constraints.
4. Make minimal targeted edits and avoid touching shared UI primitives for one-off layout fixes.
5. Run the narrowest useful checks first, then `npm run build` when feasible.
6. Report exactly what changed and what was verified.
