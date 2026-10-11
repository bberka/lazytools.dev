# Architecture Notes

This document reflects the current application architecture for LazyTools Collection after the completed move to Next.js App Router and static export.

## Status

- The active application is the Next.js app in `src/`
- Static export is configured in `next.config.mjs`
- All live tool pages are generated from the typed registry in `src/lib/utils/tool-registry.ts`
- Tool interactions run in browser-side client components
- The production build output is written to `out/`
- Native desktop applications (Windows, macOS, Linux) are wrapped using Tauri v2 in `src-tauri/`
- Versions are automatically set during release workflows (tag pushes) via the `scripts/sync-version.js` helper.

## Rendering Model

- Route HTML is generated at build time
- Tool pages are statically exported with `generateStaticParams()`
- Client components hydrate after load to power interactive tools
- Browser-only work stays inside client components, effects, and event handlers

The app is a static export with client-side tool execution layered on top. It is not request-time server rendered.

## Key Files

- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/tools/[slug]/page.tsx`
- `src/components/ToolPageClient.tsx`
- `src/lib/utils/tool-registry.ts`
- `src/lib/catalog` (tool catalog built from the registry)
- `src/lib/tags` (tag names, icons, styles, order)
- `src/lib/preferences` and `src/lib/contexts/*`
- `src/lib/home` (home-page session state)
- `src/lib/commands` (app commands and shortcuts)
- `src/app/sw-precache.js/route.ts` (service-worker precache list, emitted by the build)
- `scripts/sync-version.js` (invoked in CI to keep package.json, tauri.conf.json, and Cargo.toml versions in sync with the pushed Git release tag)
- `src-tauri/tauri.conf.json` (Tauri app packaging configuration)

## Tool Wiring

Tools are defined in `src/lib/utils/tool-registry.ts`. Each registry entry includes:

- slug
- display metadata
- typed lazy component loader

Current behavior:

- `src/lib/catalog` builds the tool catalog from the registry for static routes, search, filtering, grouping, sitemap, and metadata. It owns the hidden policy: hidden tools are left out of discovery and always reachable by id
- `src/app/tools/[slug]/page.tsx` resolves the selected tool and renders it inside `ToolPageClient`
- `npm run typecheck` catches missing component loaders and invalid component exports

## Module Map

Behaviour that several callers need lives in one module with a small interface, so it can be tested through that interface and changed in one place.

| Module | Owns |
| --- | --- |
| `src/lib/catalog` | Visibility, lookup with loader, search scoring, filtering, grouping by tag |
| `src/lib/tags` | Tag name, description, icon, per-surface classes, order |
| `src/lib/preferences` | `localStorage` keys, defaults, hydration, write-through, cross-tab sync |
| `src/lib/home` | Home-page `sessionStorage` state, reset signal, grid navigation maths |
| `src/lib/commands` | App commands, shortcuts, platform labels |
| `src/lib/files` + `useFileIntake`, `useObjectUrl`, `FileDropzone` | File picking, drag-and-drop, validation, reading, downloads, size labels |
| `src/lib/pdf` | pdfjs loading, bundled worker, opening, rendering, text extraction |
| `src/lib/markdown`, `src/lib/export` | Markdown parser configuration, export template, snapshot PDF, print |
| `src/lib/tools/*` | Pure logic of individual tools |

Storage-backed modules take their storage as an argument, with a browser adapter for the app and an in-memory adapter for unit tests.

## Static Export Notes

With `output: 'export'`:

- Next generates one HTML file per route at build time
- Dynamic routes like `/tools/[slug]` work through `generateStaticParams()`
- `robots.txt` and `sitemap.xml` are emitted statically
- Tool pages generate metadata from the shared tool config

### Web Build and Deploy

```bash
npm install
npm run build
```

Output:
```text
out/
```

If deploying with Wrangler, the asset directory should point to `./out`.

### Desktop Build

Requires Rust toolchain.

```bash
npm run desktop:build
```

Outputs:
- **Build Target**: `src-tauri/target/release/`
- **Installers**: `src-tauri/target/release/bundle/` (e.g. `.msi`, `.exe` on Windows)

Automated builds for Windows, macOS, and Linux occur via GitHub Actions on new tag pushes (`v*`), generating installer files and a version-prefixed web static zip (e.g., `0.1.0-lazytools-web.zip`).
