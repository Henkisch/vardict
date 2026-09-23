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
6. **App SDK smoke test: PASS.** Inside the Dashboard the Control Room greeted Henrik by name (auth from
   the Dashboard session) and listed the test document through `useQuery`. Patching the title over the HTTP
   API updated the screen in about 3 s with no reload, so live updates work for the big screen.

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
- Plan tier: Free (Henrik is on the Sanity Pioneer builder track, no paid plan). So no Scheduled Function
  at all, and `/api/tick` is the only ticker.

### Versions pinned

`@sanity/workflow-engine` / `@sanity/workflow-cli` **0.35.0** (exact), `sanity` 6.16, `@sanity/sdk-react` 2.x,
Next 16.3.6, Node 24, pnpm 10.15.

### Late snag: "the app just spins"

Henrik first opened the Dashboard dev link on his **phone**. `?dev=http://localhost:3334` makes the
Dashboard iframe load `localhost` from the device doing the viewing, so on a phone it points at the phone
and spins forever. Opened on the Mac instead (through Claude in Chrome), it worked. Worth remembering for
the demo: the Control Room is a laptop/big-screen app; phones only ever use the deployed `/vote` page.
Also, the smoke list rendered below the fold of the template's welcome card, so it was moved to the top.

---

## Session 2 — 2026-09-23 (evening) — Schema, Studio, first content

**Goal (milestone Sep 25):** all six types live, clip input previews a clip, 2 incidents entered.

### What we did

1. **Schema:** `incident`, `match`, `team`, `law`, `referendum`, `vote` plus `clip` and `outcry` objects, with
   the brief's validation (clip end > start and ≤ 30 s, at least one outcry source, no vote after
   `closesAt`). `referendum` and `vote` are read-only in the Studio under "Live data", because the workflow
   and the vote route write them. `finalCall` is read-only too, since only the workflow sets it.
2. **Two fields the brief missed**, both needed by the bot crowd:
   - `recommendationFavours` (home/away): home and away fans can't take sides without knowing who the VAR
     call helps.
   - `crowdSeed`: the "fixed random seed per incident" from the brief needed somewhere to live.
3. **Clip input:** a custom object input showing a `youtube-nocookie` embed that plays from the chosen start
   to end, with a replay button and a live length/validation readout. Pasting any YouTube URL keeps only the
   11-character ID.
4. **Studio deployed** to https://vardict.sanity.studio so Henrik can review from his phone. It's needed for
   the submission anyway.
5. **Content:** 6 Laws of the Game (5, 9, 10, 11, 12, 14) in our own words, 9 teams, 5 matches, and all
   5 incidents as **drafts** for Henrik to review, via `studio/seed/incidents.py`.

### Incident research: human picks, agent verifies

- I started a background research agent to build a shortlist. Meanwhile Henrik sent his own five picks
  (in Swedish, from his phone), so the agent was redirected to fact-check them.
- Results:
  - Four picks checked out cleanly.
  - **Khalilzadeh (World Cup 2026)** happened after my knowledge cutoff, so it had to be verified from scratch.
    It did happen, but "ruled out by a millimetre" is one outlet's phrase. Other sources say "marginal", "the
    width of a sleeve", or give a different reason for the offside altogether. The incident now says
    "marginal offside" and presents the millimetre as a claim, not a fact.
  - The brief's "longest delay" slot had no candidate among Henrik's picks. The research found the Premier
    League record (West Ham v Forest, 374 s). Henrik chose to keep his five and drop the slot.
- Every YouTube clip is on an official channel (FIFA, FOX Soccer, SuperSport, Tottenham Hotspur), checked
  through YouTube's oEmbed API. The agent couldn't play video, so **no start/end times are set**. Henrik sets
  them with the clip preview input.

### Things left blank on purpose (no invented facts)

| Incident | Missing | Why |
| --- | --- | --- |
| Cucurella | minute, realDelaySeconds | ~106' only in search snippets; there was no monitor review to time |
| Japan v Spain | realDelaySeconds | every source says "lengthy", none gives a number |
| Khalilzadeh | realDelaySeconds | same |
| Díaz | minute | not confirmed in the sources we opened |

Perišić's 240 s is "four minutes from corner to decision" (ESPN), not a measured review. Díaz's 40 s is an upper
bound ("under 40 s from goal to restart").

### Snags

- **The CLI login vanished mid-session.** `sanity schema deploy` said "You must login first". The auth token was
  gone from `~/.config/sanity/config.json`, though `sanity debug` had shown a login an hour earlier. The cause is
  unknown; Henrik logged in again.
- **Sanity UI v4 renamed `Stack space` to `gap`.** `tsc` caught it; `sanity build` didn't.
- **Port 3333 belongs to another of Henrik's projects**, so the Studio runs on 3335 locally.
- **python.org Python has no CA certs** (`CERTIFICATE_VERIFY_FAILED`). Fix: `SSL_CERT_FILE=/etc/ssl/cert.pem`,
  not disabling verification.
- **Drafts are invisible by default.** API v2025-02-19 queries use the `published` perspective, so the seed
  script's "already exists?" check couldn't see its own drafts and a rerun would have duplicated them. Fixed with
  `perspective=raw`.
- **The dev-mode Dashboard link doesn't work on a phone**, because `localhost` points at the phone. That's why the
  Studio got deployed.

### The clip hunt: FIFA blocks embedding

- **Finding:** oEmbed said all six official clips were fine (HTTP 200), but loading them through the YouTube IFrame
  API told a different story. Every FIFA, FOX Soccer and SuperSport World Cup/Euro upload returns **error 150: the
  owner blocks embedding** (or blocks it in Sweden; the error code is the same). Only the Tottenham clip embedded.
  So an HTTP 200 from oEmbed doesn't mean a video can be embedded. Test it in a real player.
- **Search:** the fix was broadcaster analysis segments that contain the footage and allow embeds. ESPN FC had the
  Cucurella replay and the top-down Japan ball-on-the-line still. CBS Sports Golazo had Iran v Egypt footage.
- **Finding moments without watching:** the agent can't play video. Instead I pulled each video's **storyboard**
  (the thumbnail sprite sheets YouTube uses for scrubbing), cut them into a labelled contact sheet with PIL, and read
  the frames. One image per video showed where the incident was. Storyboards work even when a video can't be
  embedded.
- **Perišić has no embeddable footage anywhere.** FIFA owns it, and ESPN's segments are all studio talk. Per the
  brief's fallback rule, the site shows the fallback text and links out to FIFA's highlights at 238–268 s
  (`embedAllowed: false`).
- **Khalilzadeh clip needs a human eye:** the CBS footage at 418–443 s shows an Iran goal and celebration, but the
  thumbnails are too small to tell the disallowed goal from Rezaeian's legitimate equaliser.
- **Error 153 in the Studio.** Henrik opened the deployed Studio on his phone and every preview said "video player
  configuration error, error 153". YouTube now rejects embeds that send no referrer, and the Studio's page strips
  it. The fix was one attribute on the iframe (`referrerPolicy="strict-origin-when-cross-origin"`). I proved it
  with a side-by-side test page (no-referrer → error 153, with the attribute → plays) because the browser tool
  couldn't reach into the Dashboard's cross-origin Studio iframe. Lesson: I never actually looked at the preview
  in the deployed Studio before calling it done.
