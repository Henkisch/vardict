# VARdict build log

Honest session notes for the "My Build Process" section of the writeup. Newest session at the bottom.

---

## Session 1 — 2026-09-23 — Setup and risk check

**Goal:** scaffold the monorepo, create the Sanity project, and verify the two risky assumptions
(Workflows early access, App SDK auth) before writing any product code.

### What we did

1. **Planned first, read-only.** Henrik pasted the draft brief and turned on plan mode. Before touching
   anything I read the current Sanity docs (Workflows, App SDK auth, Functions) through the Sanity MCP
   `read_docs` tool and the `llms.txt` index, instead of relying on memory.
2. **Wrong account caught before anything was created.** The Sanity MCP was logged in as a work account
   (`support@…`, Kodamera org). I asked before creating the project. Henrik switched both the MCP (`/mcp` →
   re-authenticate) and the CLI (`sanity login`) to his personal GitHub-based account. `whoami` and
   `sanity debug` confirmed both matched.
3. **Sanity project via MCP:** `create_project` → `t2sbu6uu` ("VARdict") with a public `production`
   dataset. `create_dataset` → private `workflows` dataset. CORS for localhost 3000/3333/3334.
4. **Scaffolded the pnpm monorepo** without interactive prompts:
   - `/studio`: `sanity init -y --template clean --typescript --project t2sbu6uu` (sanity 6.16)
   - `/control-room`: `sanity init -y --template app-quickstart --organization o7aI6GMzu`
   - `/web`: `create-next-app` (Next 16.3.6, App Router, Tailwind), placeholder `/vote` and `/incidents/[slug]`
   - `/functions`, `/workflows`: package stubs
   - All three apps build (`pnpm -r build`).
5. **Workflows smoke test: PASS.** A two-stage `smoke` definition (`varRoom` → `upheld`) deployed to the
   `workflows` dataset; one instance started against a document in `production`; firing `recommend`
   cascaded the instance to `upheld`. Then nuked the smoke state.
6. **App SDK smoke test:** Control Room shows a live `useQuery` list of the test document inside the
   Dashboard. *(Pending: Henrik opening it in his browser.)*

### Course corrections (the interesting part)

- **The brief's timer plan couldn't work.** The draft said "a Scheduled Function ticks in-flight instances so
  vote windows close on time." The docs say two things that kill this:
  1. Workflows is a library, not a service: *nothing moves unless your code calls `tick()`*.
  2. Scheduled Functions run at most **daily on Free, hourly on Growth, minutely on Enterprise**.
     Our vote windows are 10–30 seconds.

  Fix: a `POST /api/tick` route in the Next.js app, called by the Control Room when its countdown hits zero
  and by the bot crowd after its last wave. Found in the docs before writing a line of workflow code, which
  is the whole point of a risk-check day.
- **Guards are advisory.** The brief wanted a guard stopping `finalCall` from being set before `Upheld`.
  In early access the Content Lake doesn't enforce guard documents yet. We keep the guard for the UI, and
  only the Upheld effect writes `finalCall`.
- **The Workflows CLI can't start our workflow.** `sanity-workflows start` was rejected:
  `ref "dataset:t2sbu6uu:production:smoke-1" targets dataset "t2sbu6uu.production", which this deployment
  does not declare — declared surface: the workflow resource (dataset "t2sbu6uu.workflows"). Add a
  resourceClients entry for the target resource, or fix the ref.`
  Adding `resourceAliases` to `sanity.workflow.ts` didn't help: aliases only rewrite refs baked into the
  definition at deploy time, and incidents are supplied at runtime. `resourceClients` is an engine option,
  and the CLI doesn't expose it. Fix: a 40-line `workflows/scripts/smoke.ts` that calls `createEngine`
  with a `resourceClients` resolver for `production`. It passed on the first run. The real runtime (tick
  route, effect drainer) will use the same pattern.
- **Small scaffolding snags:** the Studio template named its package `vardict`, the same as the workspace
  root, so it was renamed to `studio`. create-next-app wrote its own `pnpm-workspace.yaml` inside `/web`;
  moved its settings to the root. Port 3333 was taken, so the App SDK dev server runs on 3334 and needed
  its own CORS entry.

### Prompts that worked

- Pasting the full brief with a "First session" checklist, in plan mode. It gave the agent the whole
  picture and forced research before action.
- "Verify, don't assume" in the brief. It is why the Scheduled Function problem surfaced on day 1 instead
  of day 5.

### Mistakes / things to watch

- **Secrets in the transcript.** The MCP `create_project` tool prints the new project's read and write
  tokens in its output. They went straight into gitignored `.env.local` files and are in no tracked file,
  but they *are* in this session's transcript, which the challenge asks us to publish. They must be rotated
  before the transcript goes public.
- I opted out of Workflows definition sharing (`--no-share-defs`) on the second deploy without asking.
  Harmless (the first deploy shared the smoke definition by default), but it's Henrik's call. Revisit when
  `peoplesVar` is deployed.
- Plan tier of the personal org isn't checked yet. It only matters if we want an hourly janitor Scheduled
  Function.

### Versions pinned

`@sanity/workflow-engine` / `@sanity/workflow-cli` **0.35.0** (exact), `sanity` 6.16, `@sanity/sdk-react` 2.x,
Next 16.3.6, Node 24, pnpm 10.15.
