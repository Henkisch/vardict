# VARdict

An entry for the [Sanity Challenge on DEV](https://dev.to/challenges/sanity-2026-09-16), Path Two: Vibe-Code
Something Strange. The VAR room makes a decision, but it only stands if the public confirms it by live vote.
"Football fixed VAR. We fixed it with democracy. Now it's slower and less accurate."

Live: [/live](https://live-vardict.vercel.app/live) (big screen + "Send to the people"),
[/vote](https://live-vardict.vercel.app/vote) (phone voting), [/incidents](https://live-vardict.vercel.app/incidents)
(results).

## Packages (pnpm workspace, Node 24 - see `.nvmrc`)

| Path | What | Run |
| --- | --- | --- |
| `studio` | Sanity Studio: schemas, custom clip input | `pnpm dev:studio` |
| `web` | Next.js 16: `/vote`, `/live`, `/incidents`, the API routes | `pnpm dev:web` |
| `var-room` | App SDK app: Henrik's private operator console (Sanity login required) | `pnpm dev:var-room` |
| `workflows` | The `peoplesVar` definition, shared constants, runtime, tests | `pnpm --filter workflows test` |
| `functions` | Not used - see `functions/README.md` | - |

## Checks

`pnpm verify` runs typecheck, lint, the workflow tests and a workflow-definition validation
(`sanity-workflows deploy --check`) across every package. Run it before committing.

## Scripts (`workflows/scripts/`)

These talk to the real Sanity project (`t2sbu6uu`), not a local sandbox - run with
`pnpm tsx --env-file=../.env.local scripts/<name>.ts` from `workflows/`.

- `live-run.ts` drives a full run against real data (cleans up after itself).
- `crowd-run.ts` runs the simulated crowd against a referendum.
- `reset.ts` is **destructive**: aborts every live run, deletes all votes and referendums, clears every
  incident's final call. For dress rehearsals, not for casual use.

## Environment

Copy `.env.example` to `.env.local` at the root and in `web/` and `var-room/` (see each package's
`.env.example`) and fill in the tokens. Never commit `.env.local`; the write token must never reach browser
code.

## More

- [`CLAUDE.md`](./CLAUDE.md) - the full project brief: architecture, content model, the workflow, the
  simulated crowd, incidents, and open questions.
- [`BUILD_LOG.md`](./BUILD_LOG.md) - the session-by-session build log the DEV writeup is drawn from.
