# Plan 014: Link previews show the democracy clock (Open Graph images)

> **Executor instructions**: Follow the steps, verify each, honour the STOP conditions, update this plan's row in
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9a0bb9b..HEAD -- web/src/app/layout.tsx web/src/app/opengraph-image.tsx web/src/app/incidents web/src/lib/queries.ts`

## Status

- **Priority**: P3
- **Effort**: S–M (coarse)
- **Risk**: LOW
- **Depends on**: plans/010-results-index.md (the `/incidents` page and outcome logic)
- **Category**: direction
- **Planned at**: commit `9a0bb9b`, 2026-09-24

## Why this matters

The contest post on DEV links the live site and results pages, and DEV renders link cards. Today the site only has a
title and description (`web/src/app/layout.tsx` `metadata`), so the card is plain text. An image with "Time added by
democracy: 42:17" and the verdict count carries the joke into the post and into any share.

## Current state

- `web/src/app/layout.tsx`:
  ```ts
  export const metadata: Metadata = {
    title: 'VARdict',
    description: 'Football fixed VAR. We fixed it with democracy. Now it’s slower and less accurate.',
  }
  ```
- No `opengraph-image.*` files in `web/src/app`. Pages are client components (`'use client'`), so per-page metadata
  needs a server `layout.tsx` or `generateMetadata` in a server file.
- The global clock GROQ is in `web/src/lib/queries.ts` (`LIVE_QUERY` `democracySeconds`); `formatClock` formats seconds.
- Fonts: Barlow and Barlow Condensed via `next/font/google` in `layout.tsx`. Colours: ink `#0b0f0c`, var-yellow
  `#f5b400`, chalk `#eef3ec` (`web/src/app/globals.css`).
- Next.js 16: read `web/node_modules/next/dist/docs/` for `opengraph-image` and `ImageResponse` before writing code
  (`web/AGENTS.md` says Next 16 differs from training data).

## Scope

**In scope**: `web/src/app/opengraph-image.tsx` (create), `web/src/app/incidents/opengraph-image.tsx` (create),
optionally `web/src/app/incidents/[slug]/opengraph-image.tsx`, `web/src/app/layout.tsx` (`metadataBase`).

**Out of scope**: page layouts, the live data path.

## Steps

1. Read the Next 16 docs on `opengraph-image` / `ImageResponse`. Create `web/src/app/opengraph-image.tsx`: 1200×630,
   ink background, "VAR**dict**", the pitch line, and "Time added by democracy: <clock>" fetched server-side with a
   token-free Sanity client (`useCdn: true` is fine: a snapshot). Revalidate at most every 10 minutes.
   **Verify**: `pnpm --filter web build` → exit 0; the route table lists `/opengraph-image`.
2. Set `metadataBase: new URL('https://live-vardict.vercel.app')` in `layout.tsx`.
   **Verify**: `pnpm --filter web build` → exit 0.
3. Same image for `/incidents` with the five outcomes (Upheld/Abandoned/…) from plan 010's outcome logic.
   **Verify**: `pnpm verify` → exit 0.
4. After an operator deploy: `curl -sI https://live-vardict.vercel.app/opengraph-image` → `200`, `content-type: image/png`.

## Done criteria

- [ ] `pnpm verify` exits 0; `/opengraph-image` builds
- [ ] `<meta property="og:image"` present in `curl -s https://<host>/live` after deploy (or "awaiting deploy")

## STOP conditions

- `ImageResponse` can't load the Barlow fonts without bundling font files; fall back to a system font and say so,
  rather than adding font files to the repo without asking.
